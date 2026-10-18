import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ParentApp from '../src/ParentApp';
import * as api from '../src/lib/api';

jest.mock('../src/lib/api');

const makeRequest = (overrides: Partial<api.PaymentRequest> = {}): api.PaymentRequest => ({
  id: 501,
  student: { id: 101, name: 'Ariana Student' },
  parent: { id: 2, name: 'Parent A' },
  created_by: 1,
  title: 'School trip',
  description: null,
  amount_cents: 1250,
  currency: 'NZD',
  due_date: null,
  status: 'open',
  created_at: '2026-10-18T00:00:00Z',
  paid_at: null,
  payment: null,
  ...overrides,
});

describe('account switching', () => {
  const apiMock = jest.mocked(api);

  beforeEach(() => {
    cleanup();
    jest.resetAllMocks();
  });

  it('clears Parent A data and discards a delayed response after switching to Parent B', async () => {
    let releaseParentA!: (value: api.PaymentRequestList) => void;
    apiMock.getRequests.mockImplementation((userId) => {
      if (userId === 2) return new Promise((resolve) => { releaseParentA = resolve; });
      return Promise.resolve({ items: [makeRequest({
        id: 903,
        student: { id: 103, name: 'Ben Student' },
        parent: { id: 3, name: 'Parent B' },
        title: 'Sports fee',
      })] });
    });

    await render(<ParentApp initialTab="requests" />);
    fireEvent.press(await screen.findByRole('button', { name: 'Account' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Switch to Parent B' }));
    fireEvent.press(screen.getByRole('button', { name: 'Requests' }));
    expect(await screen.findByText('Ben Student')).toBeTruthy();

    releaseParentA({ items: [makeRequest()] });
    await waitFor(() => expect(screen.queryByText('Ariana Student')).toBeNull());
    expect(screen.getByText('Sports fee')).toBeTruthy();
  });
});
