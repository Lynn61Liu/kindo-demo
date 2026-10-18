import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ParentApp from '../src/ParentApp';
import * as api from '../src/lib/api';

jest.mock('../src/lib/api');

const request = (overrides: Partial<api.PaymentRequest> = {}): api.PaymentRequest => ({
  id: 501,
  student: { id: 101, name: 'Ariana Student' },
  parent: { id: 2, name: 'Parent A' },
  created_by: 1,
  title: 'School trip',
  description: 'Museum visit',
  amount_cents: 1250,
  currency: 'NZD',
  due_date: '2026-10-20',
  status: 'open',
  created_at: '2026-10-18T00:00:00Z',
  paid_at: null,
  payment: null,
  ...overrides,
});

const list = (items: api.PaymentRequest[]) => ({ items });

describe('ParentApp', () => {
  const apiMock = jest.mocked(api);

  beforeEach(() => {
    cleanup();
    jest.resetAllMocks();
    apiMock.getRequests.mockResolvedValue(list([request()]));
    apiMock.getRequest.mockImplementation(async (_userId, id) => request({ id }));
    apiMock.simulatePayment.mockImplementation(async (_userId, id) => request({
      id,
      status: 'paid',
      paid_at: '2026-10-18T01:00:00Z',
      payment: {
        id: 701,
        payer_id: 2,
        amount_cents: 1250,
        status: 'succeeded',
        provider_reference: 'simulated-501',
        created_at: '2026-10-18T01:00:00Z',
      },
    }));
  });

  it('shows the real open count on Home and opens Pending requests', async () => {
    await render(<ParentApp />);

    expect(await screen.findByText('1 pending request')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'View requests' }));

    expect(await screen.findByText('School trip')).toBeTruthy();
    expect(screen.getByText('Ariana Student')).toBeTruthy();
    expect(screen.getByText('NZ$12.50')).toBeTruthy();
    expect(apiMock.getRequests).toHaveBeenCalledWith(2, 'open', expect.any(AbortSignal));
  });

  it('requires explicit confirmation and displays the paid result', async () => {
    await render(<ParentApp initialTab="requests" />);
    fireEvent.press(await screen.findByRole('button', { name: 'See more: School trip' }));

    expect(await screen.findByText('Ariana Student · School Demo')).toBeTruthy();
    expect(screen.getByText('Simulated payment · no money will be charged')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Confirm simulated payment of NZ$12.50' }));

    expect(await screen.findByText('Payment recorded')).toBeTruthy();
    expect(apiMock.simulatePayment).toHaveBeenCalledWith(2, 501);
    expect(screen.queryByRole('button', { name: /Confirm simulated payment/ })).toBeNull();
  });

  it('shows a retry after a load error and then renders the empty state', async () => {
    apiMock.getRequests
      .mockRejectedValueOnce(new api.ApiError('Server is unavailable.'))
      .mockResolvedValueOnce(list([]));
    await render(<ParentApp initialTab="requests" />);

    expect(await screen.findByText('We couldn’t load requests')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('You’re all caught up')).toBeTruthy();
    expect(apiMock.getRequests).toHaveBeenCalledTimes(2);
  });

  it('shows paid details without offering another payment', async () => {
    const paidRequest = request({
      status: 'paid',
      paid_at: '2026-10-18T01:00:00Z',
      payment: {
        id: 701,
        payer_id: 2,
        amount_cents: 1250,
        status: 'succeeded',
        provider_reference: 'simulated-501',
        created_at: '2026-10-18T01:00:00Z',
      },
    });
    apiMock.getRequests.mockResolvedValue(list([paidRequest]));
    apiMock.getRequest.mockResolvedValue(paidRequest);
    await render(<ParentApp initialTab="requests" />);
    fireEvent.press(await screen.findByRole('tab', { name: 'Paid' }));
    await waitFor(() => expect(apiMock.getRequests).toHaveBeenCalledWith(2, 'paid', expect.any(AbortSignal)));
    fireEvent.press(await screen.findByRole('button', { name: 'See more: School trip' }));

    expect(await screen.findByText('Payment recorded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Confirm simulated payment/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pay in full: School trip' })).toBeNull();
  });

  it('disables the payment action while the request is in flight', async () => {
    let releasePayment!: (value: api.PaymentRequest) => void;
    apiMock.simulatePayment.mockImplementation(() => new Promise((resolve) => { releasePayment = resolve; }));
    await render(<ParentApp initialTab="requests" />);
    fireEvent.press(await screen.findByRole('button', { name: 'Pay in full: School trip' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm simulated payment of NZ$12.50' });
    fireEvent.press(confirm);

    expect(await screen.findByText('Recording payment…')).toBeTruthy();
    expect(confirm.props.accessibilityState?.disabled).toBe(true);
    expect(apiMock.simulatePayment).toHaveBeenCalledTimes(1);

    releasePayment(request({ status: 'paid', paid_at: '2026-10-18T01:00:00Z' }));
    await screen.findByText('Payment recorded');
  });

  it('allows a payment retry after an uncertain network failure and removes the open request after success', async () => {
    apiMock.simulatePayment
      .mockRejectedValueOnce(new Error('The response timed out.'))
      .mockResolvedValueOnce(request({
        status: 'paid',
        paid_at: '2026-10-18T01:00:00Z',
        payment: {
          id: 701,
          payer_id: 2,
          amount_cents: 1250,
          status: 'succeeded',
          provider_reference: 'simulated-501',
          created_at: '2026-10-18T01:00:00Z',
        },
      }));
    await render(<ParentApp initialTab="requests" />);
    fireEvent.press(await screen.findByRole('button', { name: 'Pay in full: School trip' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm simulated payment of NZ$12.50' });

    fireEvent.press(confirm);
    expect(await screen.findByText('The response timed out.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm simulated payment of NZ$12.50' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm simulated payment of NZ$12.50' }));
    expect(await screen.findByText('Payment recorded')).toBeTruthy();
    expect(apiMock.simulatePayment).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Pay in full: School trip' })).toBeNull();
  });

  it('refreshes the Home pending count after payment when navigating back', async () => {
    apiMock.getRequests
      .mockResolvedValueOnce(list([request()]))
      .mockResolvedValueOnce(list([]));
    await render(<ParentApp initialTab="requests" />);
    fireEvent.press(await screen.findByRole('button', { name: 'Pay in full: School trip' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Confirm simulated payment of NZ$12.50' }));
    await screen.findByText('Payment recorded');

    fireEvent.press(screen.getByRole('button', { name: 'Home' }));
    expect(await screen.findByText('0 pending requests')).toBeTruthy();
    expect(apiMock.getRequests).toHaveBeenCalledTimes(2);
  });

  it('exposes selected navigation and request status to accessibility services', async () => {
    await render(<ParentApp initialTab="requests" />);
    await screen.findByRole('button', { name: 'Pay in full: School trip' });

    expect(screen.getByRole('button', { name: 'Requests' }).props.accessibilityState?.selected).toBe(true);
    fireEvent.press(screen.getByRole('tab', { name: 'Paid' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Paid' }).props.accessibilityState?.selected).toBe(true));
    expect(screen.getByRole('tab', { name: 'Pending' }).props.accessibilityState?.selected).toBe(false);
  });

  it('keeps the action accessible when a request title and description are long', async () => {
    apiMock.getRequests.mockResolvedValue(list([request({
      title: 'Annual outdoor education and overnight camp contribution for Year Seven students',
      description: 'This long note explains transport, meals, equipment, the schedule, and how families can contact the school about this request.',
    })]));
    await render(<ParentApp initialTab="requests" />);

    expect(await screen.findByText('Annual outdoor education and overnight camp contribution for Year Seven students')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pay in full: Annual outdoor education and overnight camp contribution for Year Seven students' })).toBeTruthy();
  });
});
