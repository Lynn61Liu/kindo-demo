import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from './lib/api';
import { formatAucklandDateTime, formatDueDate, formatMoney, studentColor } from './lib/format';
import type { DemoParent, PaymentRequest, PaymentStatus } from './lib/types';
import { DEMO_PARENTS } from './lib/types';

type Tab = 'home' | 'requests' | 'account';
type Props = { initialTab?: Tab };

const C = {
  teal: '#065969',
  tealText: '#00687A',
  ink: '#252A2A',
  muted: '#666666',
  line: '#E2E8F0',
  pale: '#DDF2F0',
  surface: '#FFFFFF',
  paid: '#2F6B2D',
  error: '#B42318',
};

export default function ParentApp({ initialTab = 'home' }: Props) {
  const [parent, setParent] = useState<DemoParent>(DEMO_PARENTS[0]);
  const [tab, setTab] = useState<Tab>(initialTab);

  const changeParent = (next: DemoParent) => {
    setParent(next);
    setTab('account');
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.screen}>
          {tab === 'home' && (
            <HomeScreen key={parent.id} parent={parent} onOpenRequests={() => setTab('requests')} />
          )}
          {tab === 'requests' && (
            <RequestsScreen key={parent.id} parent={parent} />
          )}
          {tab === 'account' && <AccountScreen parent={parent} onChangeParent={changeParent} />}
          <BottomTabs tab={tab} onSelect={setTab} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function PageTitle({ children }: React.PropsWithChildren) {
  return <Text style={styles.pageTitle}>{children}</Text>;
}

function HomeScreen({ parent, onOpenRequests }: { parent: DemoParent; onOpenRequests: () => void }) {
  const [requests, setRequests] = useState<PaymentRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const capturedParentId = parent.id;
    let active = true;
    api.getRequests(capturedParentId, 'open', controller.signal)
      .then(({ items }) => { if (active) setRequests(items); })
      .catch((reason: unknown) => {
        if (active && !controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => { active = false; controller.abort(); };
  }, [parent.id, reload]);

  const retry = () => {
    setRequests(null);
    setError(null);
    setReload((value) => value + 1);
  };
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.homeContent}>
        <PageTitle>Home</PageTitle>
        <View style={styles.welcome}>
          <Text style={styles.welcomeEyebrow}>SCHOOL DEMO</Text>
          <Text style={styles.welcomeTitle}>Kia ora, {parent.name}</Text>
          <Text style={styles.welcomeSchool}>School Demo</Text>
        </View>
        {error ? (
          <StateMessage title="We couldn’t load your requests" body={error} action="Try again" onAction={retry} />
        ) : requests === null ? (
          <LoadingState label="Loading requests…" />
        ) : (
          <Pressable style={styles.countPanel} accessibilityRole="button" accessibilityLabel="View requests" onPress={onOpenRequests}>
            <View style={styles.countCopy}>
              <Text style={styles.countLabel}>PENDING REQUESTS</Text>
              <Text style={styles.countNumber}>{requests.length}</Text>
              <Text style={styles.countDescription}>
                {requests.length === 1 ? '1 pending request' : `${requests.length} pending requests`}
              </Text>
            </View>
            <View style={styles.countAction}>
              <Text style={styles.countLink}>View requests</Text>
              <Ionicons name="chevron-forward" size={18} color={C.teal} />
            </View>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function RequestsScreen({ parent }: { parent: DemoParent }) {
  const [status, setStatus] = useState<PaymentStatus>('open');
  const [requestLoad, setRequestLoad] = useState<{
    key: string;
    items: PaymentRequest[] | null;
    error: string | null;
  }>({ key: '', items: null, error: null });
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<PaymentRequest | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const requestKey = `${parent.id}:${status}:${reload}`;
  const mountedRef = useRef(true);
  const detailGenerationRef = useRef(0);
  const detailControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // React StrictMode runs effect cleanup/setup once on mount in development.
    // Restore the flag in setup so the development pass does not suppress results.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      detailControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    api.getRequests(parent.id, status, controller.signal)
      .then(({ items }) => { if (active) setRequestLoad({ key: requestKey, items, error: null }); })
      .catch((reason: unknown) => {
        if (active && !controller.signal.aborted) setRequestLoad({ key: requestKey, items: null, error: errorMessage(reason) });
      });
    return () => { active = false; controller.abort(); };
  }, [parent.id, status, reload, requestKey]);

  const requests = requestLoad.key === requestKey ? requestLoad.items : null;
  const error = requestLoad.key === requestKey ? requestLoad.error : null;

  const openDetail = async (requestId: number) => {
    detailControllerRef.current?.abort();
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const generation = ++detailGenerationRef.current;
    const capturedParentId = parent.id;
    setSelectedRequestId(requestId);
    setDetail(null);
    setDetailError(null);
    setPaymentError(null);
    setDetailLoading(true);
    try {
      const result = await api.getRequest(capturedParentId, requestId, controller.signal);
      if (mountedRef.current && generation === detailGenerationRef.current && capturedParentId === parent.id) setDetail(result);
    } catch (reason) {
      if (mountedRef.current && !controller.signal.aborted && generation === detailGenerationRef.current && capturedParentId === parent.id) setDetailError(errorMessage(reason));
    } finally {
      if (mountedRef.current && generation === detailGenerationRef.current && capturedParentId === parent.id) setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    detailGenerationRef.current += 1;
    detailControllerRef.current?.abort();
    detailControllerRef.current = null;
    setSelectedRequestId(null);
    setDetail(null);
    setDetailError(null);
    setPaymentError(null);
  };

  const pay = async () => {
    if (!detail || detail.status !== 'open' || paying) return;
    const capturedParentId = parent.id;
    const requestId = detail.id;
    const capturedDetailGeneration = detailGenerationRef.current;
    setPaying(true);
    setPaymentError(null);
    try {
      const result = await api.simulatePayment(capturedParentId, requestId);
      if (!mountedRef.current || capturedParentId !== parent.id) return;
      if (capturedDetailGeneration === detailGenerationRef.current) setDetail(result);
      setRequestLoad((previous) => previous.key === requestKey && previous.items
        ? { ...previous, items: previous.items.filter((item) => item.id !== requestId) }
        : previous);
    } catch (reason) {
      if (mountedRef.current && capturedParentId === parent.id && capturedDetailGeneration === detailGenerationRef.current) setPaymentError(errorMessage(reason));
    } finally {
      if (mountedRef.current && capturedParentId === parent.id) setPaying(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.requestsContent}>
        <PageTitle>Requests</PageTitle>
        <View style={styles.tabs}>
          <StatusTab label="Pending" selected={status === 'open'} onPress={() => setStatus('open')} />
          <StatusTab label="Paid" selected={status === 'paid'} onPress={() => setStatus('paid')} />
        </View>
        <View style={styles.listCaptionRow}>
          <Text style={styles.listCaption}>{status === 'open' ? 'PENDING REQUESTS' : 'PAID REQUESTS'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh requests" hitSlop={8} onPress={() => setReload((value) => value + 1)}>
            <Ionicons name="refresh-outline" size={19} color={C.teal} />
          </Pressable>
        </View>
        {error ? (
          <StateMessage title="We couldn’t load requests" body={error} action="Try again" onAction={() => setReload((value) => value + 1)} />
        ) : requests === null ? (
          <LoadingState label="Loading requests…" />
        ) : requests.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name={status === 'open' ? 'checkmark-circle-outline' : 'receipt-outline'} size={32} color={C.teal} />
            <Text style={styles.emptyTitle}>{status === 'open' ? 'You’re all caught up' : 'No paid requests yet'}</Text>
            <Text style={styles.emptyBody}>{status === 'open' ? 'New school payment requests will appear here.' : 'Completed requests will appear here.'}</Text>
          </View>
        ) : requests.map((item) => (
          <RequestRow key={item.id} item={item} onSeeMore={() => void openDetail(item.id)} onPay={() => void openDetail(item.id)} />
        ))}
      </ScrollView>

      <PaymentSheet
        visible={detail !== null || detailLoading || detailError !== null}
        detail={detail}
        loading={detailLoading}
        loadError={detailError}
        paymentError={paymentError}
        paying={paying}
        onClose={closeDetail}
        onRetry={() => selectedRequestId !== null && void openDetail(selectedRequestId)}
        onPay={() => void pay()}
      />
    </View>
  );
}

function RequestRow({ item, onSeeMore, onPay }: { item: PaymentRequest; onSeeMore: () => void; onPay: () => void }) {
  const initial = item.student.name.trim().charAt(0).toLocaleUpperCase('en-NZ') || '?';
  return (
    <View style={styles.requestRow}>
      <View style={styles.studentLine}>
        <View style={[styles.avatar, { backgroundColor: studentColor(item.student.id) }]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <Text style={styles.studentName} numberOfLines={1}>{item.student.name}</Text>
        <Text style={styles.amount}>{formatMoney(item.amount_cents, item.currency)}</Text>
      </View>
      <Text style={styles.requestTitle}>{item.title}</Text>
      <Text style={styles.schoolName}>School Demo</Text>
      {!!item.description && <Text style={styles.description} numberOfLines={2}>{item.description}</Text>}
      {item.due_date && <Text style={styles.meta}>Due {formatDueDate(item.due_date)}</Text>}
      {item.status === 'paid' ? (
        <View style={styles.rowActions}>
          <View style={styles.paidLine}>
            <Text style={styles.paidLabel}>Paid</Text>
            {!!item.paid_at && <Text style={styles.meta}>{formatAucklandDateTime(item.paid_at)}</Text>}
          </View>
          <Pressable style={styles.seeMoreButton} accessibilityRole="button" accessibilityLabel={`See more: ${item.title}`} onPress={onSeeMore}>
            <Text style={styles.seeMoreText}>See more</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.rowActions}>
          <Pressable style={styles.seeMoreButton} accessibilityRole="button" accessibilityLabel={`See more: ${item.title}`} onPress={onSeeMore}>
            <Text style={styles.seeMoreText}>See more</Text>
          </Pressable>
          <Pressable style={styles.payOutlineButton} accessibilityRole="button" accessibilityLabel={`Pay in full: ${item.title}`} onPress={onPay}>
            <Text style={styles.payOutlineText}>Pay in full</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function StatusTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.statusTab} accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress}>
      <Text style={[styles.statusTabText, selected && styles.statusTabSelected]}>{label}</Text>
      {selected && <View style={styles.statusUnderline} />}
    </Pressable>
  );
}

function PaymentSheet({
  visible, detail, loading, loadError, paymentError, paying, onClose, onRetry, onPay,
}: {
  visible: boolean; detail: PaymentRequest | null; loading: boolean; loadError: string | null;
  paymentError: string | null; paying: boolean; onClose: () => void; onRetry: () => void; onPay: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel="Close request details" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetHeaderTitle}>Request details</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close request details" hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={24} color={C.ink} />
            </Pressable>
          </View>
          {loading ? <LoadingState label="Loading request…" /> : loadError ? (
            <StateMessage title="Request unavailable" body={loadError} action="Try again" onAction={onRetry} />
          ) : detail ? (
            <ScrollView contentContainerStyle={styles.sheetBody}>
              <Text style={styles.detailTitle}>{detail.title}</Text>
              <Text style={styles.detailStudent}>{detail.student.name} · School Demo</Text>
              {!!detail.description && <Text style={styles.detailDescription}>{detail.description}</Text>}
              {detail.due_date && <DetailLine label="Due date" value={formatDueDate(detail.due_date) || '—'} />}
              {detail.status === 'paid' ? (
                <View style={styles.successBox}>
                  <View style={styles.successTitleLine}>
                    <Ionicons name="checkmark-circle" size={21} color={C.paid} />
                    <Text style={styles.successTitle}>Payment recorded</Text>
                  </View>
                  <Text style={styles.successDetail}>Paid {detail.payment ? formatMoney(detail.payment.amount_cents, detail.currency) : formatMoney(detail.amount_cents, detail.currency)}</Text>
                  {!!detail.paid_at && <Text style={styles.successDetail}>{formatAucklandDateTime(detail.paid_at)}</Text>}
                  <Text style={styles.reference}>Simulated payment · no money was charged</Text>
                </View>
              ) : (
                <>
                  <View style={styles.totalLine}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalAmount}>{formatMoney(detail.amount_cents, detail.currency)}</Text>
                  </View>
                  <Text style={styles.simulatedNote}>Simulated payment · no money will be charged</Text>
                  {paymentError && <Text style={styles.inlineError} accessibilityRole="alert">{paymentError}</Text>}
                  <Pressable
                    style={[styles.confirmButton, paying && styles.buttonDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm simulated payment of ${formatMoney(detail.amount_cents, detail.currency)}`}
                    accessibilityState={{ disabled: paying }}
                    disabled={paying}
                    onPress={onPay}
                  >
                    {paying ? <ActivityIndicator color={C.surface} /> : <Text style={styles.confirmText}>Confirm simulated payment</Text>}
                  </Pressable>
                  {paying && <Text style={styles.recording}>Recording payment…</Text>}
                </>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailLine}><Text style={styles.meta}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function AccountScreen({ parent, onChangeParent }: { parent: DemoParent; onChangeParent: (parent: DemoParent) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.accountContent}>
      <PageTitle>Account</PageTitle>
      <View style={styles.accountIdentity}>
        <View style={[styles.avatar, styles.accountAvatar]}><Text style={styles.avatarInitial}>{parent.name.slice(-1)}</Text></View>
        <View>
          <Text style={styles.accountName}>{parent.name}</Text>
          <Text style={styles.meta}>Demo parent account</Text>
        </View>
      </View>
      <Text style={styles.sectionLabel}>SWITCH DEMO ACCOUNT</Text>
      {DEMO_PARENTS.map((candidate) => {
        const selected = candidate.id === parent.id;
        return (
          <Pressable
            key={candidate.id}
            style={[styles.accountChoice, selected && styles.accountChoiceSelected]}
            accessibilityRole="button"
            accessibilityLabel={selected ? `${candidate.name}, current account` : `Switch to ${candidate.name}`}
            onPress={() => onChangeParent(candidate)}
          >
            <View style={styles.accountChoiceCopy}>
              <Text style={styles.accountChoiceName}>{candidate.name}</Text>
              <Text style={styles.meta}>{selected ? 'Current account' : 'School Demo parent'}</Text>
            </View>
            {selected ? <Ionicons name="checkmark-circle" size={22} color={C.teal} /> : <Ionicons name="chevron-forward" size={20} color={C.muted} />}
          </Pressable>
        );
      })}
      <View style={styles.accountNote}>
        <Ionicons name="information-circle-outline" size={20} color={C.teal} />
        <Text style={styles.accountNoteText}>This is a local demo account selector. Payments are simulated and no money is charged.</Text>
      </View>
    </ScrollView>
  );
}

function BottomTabs({ tab, onSelect }: { tab: Tab; onSelect: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const items: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'home', label: 'Home', icon: 'home-outline' },
    { id: 'requests', label: 'Requests', icon: 'receipt-outline' },
    { id: 'account', label: 'Account', icon: 'person-circle-outline' },
  ];
  return (
    <View style={[styles.bottomTabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map((item) => {
        const selected = tab === item.id;
        return (
          <Pressable
            key={item.id}
            style={styles.bottomTab}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.id)}
          >
            <Ionicons name={item.icon} size={21} color={selected ? C.teal : '#8A9192'} />
            <Text style={[styles.bottomLabel, selected && styles.bottomLabelSelected]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LoadingState({ label }: { label: string }) {
  return <View style={styles.loading}><ActivityIndicator color={C.teal} /><Text style={styles.loadingText}>{label}</Text></View>;
}

function StateMessage({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <View style={styles.stateMessage}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      <Pressable style={styles.retryButton} accessibilityRole="button" onPress={onAction}><Text style={styles.retryText}>{action}</Text></Pressable>
    </View>
  );
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  screen: { flex: 1, backgroundColor: C.surface },
  flex: { flex: 1 },
  homeContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24, gap: 20 },
  requestsContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28 },
  accountContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28, gap: 18 },
  pageTitle: { color: C.tealText, fontSize: 28, fontWeight: '700', marginBottom: 2 },
  welcome: { backgroundColor: C.pale, borderRadius: 15, paddingHorizontal: 20, paddingVertical: 22, gap: 7 },
  welcomeEyebrow: { color: C.teal, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  welcomeTitle: { color: C.ink, fontSize: 23, fontWeight: '700' },
  welcomeSchool: { color: C.muted, fontSize: 15 },
  countPanel: { borderBottomColor: C.line, borderBottomWidth: 1, paddingVertical: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  countCopy: { gap: 5 },
  countLabel: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  countNumber: { color: C.ink, fontWeight: '700', fontSize: 28, lineHeight: 34 },
  countDescription: { color: C.muted, fontSize: 14 },
  countAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  countLink: { color: C.teal, fontSize: 14, fontWeight: '600' },
  tabs: { flexDirection: 'row', borderBottomColor: C.line, borderBottomWidth: 1, gap: 26, marginTop: 5 },
  statusTab: { minHeight: 44, justifyContent: 'center', position: 'relative' },
  statusTabText: { color: C.muted, fontSize: 16, fontWeight: '500' },
  statusTabSelected: { color: C.teal, fontWeight: '700' },
  statusUnderline: { position: 'absolute', height: 3, backgroundColor: C.teal, bottom: -1, left: 0, right: 0, borderRadius: 2 },
  listCaptionRow: { minHeight: 38, paddingTop: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listCaption: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  requestRow: { paddingVertical: 16, borderBottomColor: C.line, borderBottomWidth: 1, gap: 7 },
  studentLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: C.surface, fontSize: 16, fontWeight: '700' },
  studentName: { color: C.ink, flex: 1, fontSize: 15, fontWeight: '500' },
  amount: { color: C.ink, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  requestTitle: { color: C.ink, fontSize: 17, fontWeight: '700', marginTop: 3 },
  schoolName: { color: C.muted, fontSize: 13 },
  description: { color: C.muted, fontSize: 14, lineHeight: 20 },
  meta: { color: C.muted, fontSize: 13, lineHeight: 18 },
  rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, minHeight: 44 },
  seeMoreButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  seeMoreText: { color: C.teal, fontSize: 14, fontWeight: '600' },
  payOutlineButton: { minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: C.teal, borderRadius: 8, paddingHorizontal: 15 },
  payOutlineText: { color: C.teal, fontSize: 14, fontWeight: '600' },
  paidLine: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 12 },
  paidLabel: { color: C.paid, fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 54, gap: 10 },
  emptyTitle: { color: C.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  loading: { minHeight: 115, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { color: C.muted, fontSize: 14 },
  stateMessage: { alignItems: 'center', padding: 20, gap: 9 },
  stateTitle: { color: C.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  stateBody: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  retryText: { color: C.teal, fontSize: 15, fontWeight: '700' },
  bottomTabs: { flexDirection: 'row', minHeight: 62, paddingTop: 8, borderTopColor: C.line, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: C.surface },
  bottomTab: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomLabel: { color: '#858B8C', fontSize: 11, fontWeight: '500' },
  bottomLabelSelected: { color: C.teal, fontWeight: '700' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.26)' },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: { maxHeight: '88%', minHeight: 300, backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, overflow: 'hidden' },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 4, backgroundColor: '#C9CECE', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  sheetHeaderTitle: { color: C.ink, fontSize: 16, fontWeight: '600' },
  sheetBody: { paddingTop: 18, paddingBottom: 14, gap: 12 },
  detailTitle: { color: C.ink, fontSize: 21, fontWeight: '700' },
  detailStudent: { color: C.teal, fontSize: 14, fontWeight: '600' },
  detailDescription: { color: C.muted, fontSize: 15, lineHeight: 22, marginTop: 4 },
  detailLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  detailValue: { color: C.ink, fontSize: 14, fontWeight: '500' },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 13, marginTop: 3, borderTopColor: C.line, borderTopWidth: 1 },
  totalLabel: { color: C.ink, fontSize: 16, fontWeight: '600' },
  totalAmount: { color: C.ink, fontSize: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
  simulatedNote: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 5 },
  confirmButton: { minHeight: 50, borderRadius: 8, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center', marginTop: 5, paddingHorizontal: 15 },
  buttonDisabled: { opacity: 0.58 },
  confirmText: { color: C.surface, fontSize: 15, fontWeight: '700' },
  recording: { color: C.muted, fontSize: 13, textAlign: 'center' },
  inlineError: { color: C.error, fontSize: 14, lineHeight: 19 },
  successBox: { backgroundColor: '#F2F7F0', borderRadius: 12, padding: 16, gap: 8, marginTop: 12 },
  successTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successTitle: { color: C.paid, fontSize: 17, fontWeight: '700' },
  successDetail: { color: C.ink, fontSize: 14 },
  reference: { color: C.muted, fontSize: 12, marginTop: 4 },
  accountIdentity: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8 },
  accountAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.teal },
  accountName: { color: C.ink, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  sectionLabel: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginTop: 8 },
  accountChoice: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomColor: C.line, borderBottomWidth: 1, paddingVertical: 10 },
  accountChoiceSelected: { borderBottomColor: '#B6D4D4' },
  accountChoiceCopy: { gap: 3 },
  accountChoiceName: { color: C.ink, fontSize: 15, fontWeight: '600' },
  accountNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: C.pale, borderRadius: 10, padding: 13, marginTop: 12 },
  accountNoteText: { flex: 1, color: C.ink, fontSize: 13, lineHeight: 19 },
});
