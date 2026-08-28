import { Ionicons } from '@expo/vector-icons';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { PrimaryButton } from './PrimaryButton';
import { useT } from '@/i18n';

type Props = {
  children: ReactNode;
  /** Extra copy shown under the generic message — e.g. "in My Events". */
  where?: string;
};

type State = {
  err: Error | null;
  /** React's component stack — which component threw, and what it was
   *  nested in. Far more use than the JS stack for a render error, and
   *  the only place it exists is the argument to componentDidCatch. */
  componentStack: string | null;
};

/** How much of the trace to show. Enough to name the component and its
 *  two or three parents, which is what identifies the fault; not so much
 *  that the screen turns into a wall of frames. */
const TRACE_LINES = 6;

function trim(stack: string | null | undefined): string | null {
  if (!stack) return null;
  const lines = stack
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, TRACE_LINES);
  return lines.length ? lines.join('\n') : null;
}

/** Catches render errors so a single screen crash doesn't leave the user
 *  on a blank surface. Errors bubble to LogBox in dev regardless — this
 *  is purely so the release build has something to look at. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null, componentStack: null };

  static getDerivedStateFromError(err: unknown): State {
    // The component stack only exists in componentDidCatch, which runs
    // straight after this and fills it in.
    return { err: err instanceof Error ? err : new Error(String(err)), componentStack: null };
  }

  override componentDidCatch(err: unknown, info: ErrorInfo) {
    this.setState({ componentStack: trim(info.componentStack) });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught:', err, info.componentStack);
  }

  private reset = () => this.setState({ err: null, componentStack: null });

  override render() {
    if (!this.state.err) return this.props.children;
    // The fallback is its own function component so it can use the
    // translation hook — class components can't.
    return (
      <ErrorFallback
        err={this.state.err}
        where={this.props.where}
        componentStack={this.state.componentStack}
        onReset={this.reset}
      />
    );
  }
}

function ErrorFallback({
  err,
  where,
  componentStack,
  onReset,
}: {
  err: Error;
  where?: string;
  componentStack: string | null;
  onReset: () => void;
}) {
  const t = useT();
  return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 16 }}
        className="bg-surface-light dark:bg-surface-dark"
      >
        <View className="items-center pt-6">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
            <Ionicons name="warning" size={26} color="#EF4444" />
          </View>
          <Text className="mt-3 text-center font-display text-2xl text-text-light dark:text-text-dark">
            {t('error.title')}
          </Text>
          {where ? (
            <Text className="mt-1 text-xs text-muted-light dark:text-muted-dark">
              {where}
            </Text>
          ) : null}
        </View>

        {/* The message, and under it where it came from. Shown rather
            than swallowed because this screen is the only channel there
            is: there's no crash reporter in the build, and "it closed
            itself" is not a bug report anyone can act on. A screenshot
            of these few lines is. */}
        <View className="rounded-2xl border border-border-light bg-panel-light p-4 dark:border-border-dark dark:bg-panel-dark">
          <Text className="font-mono text-[11px] text-text-light dark:text-text-dark">
            {err.message}
          </Text>
          {componentStack ?? trim(err.stack) ? (
            <Text
              selectable
              className="mt-2 font-mono text-[9px] leading-[13px] text-muted-light dark:text-muted-dark"
            >
              {componentStack ?? trim(err.stack)}
            </Text>
          ) : null}
        </View>

        <PrimaryButton label={t('error.tryAgain')} onPress={onReset} fullWidth />
      </ScrollView>
  );
}
