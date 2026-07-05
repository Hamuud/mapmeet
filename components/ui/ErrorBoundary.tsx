import { Ionicons } from '@expo/vector-icons';
import { Component, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { PrimaryButton } from './PrimaryButton';

type Props = {
  children: ReactNode;
  /** Extra copy shown under the generic message — e.g. "in My Events". */
  where?: string;
};

type State = {
  err: Error | null;
};

/** Catches render errors so a single screen crash doesn't leave the user
 *  on a blank surface. Errors bubble to LogBox in dev regardless — this
 *  is purely so the release build has something to look at. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: unknown): State {
    return { err: err instanceof Error ? err : new Error(String(err)) };
  }

  override componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught:', err);
  }

  private reset = () => this.setState({ err: null });

  override render() {
    if (!this.state.err) return this.props.children;
    return (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 16 }}
        className="bg-surface-light dark:bg-surface-dark"
      >
        <View className="items-center pt-6">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
            <Ionicons name="warning" size={26} color="#EF4444" />
          </View>
          <Text className="mt-3 text-center font-display text-2xl text-text-light dark:text-text-dark">
            Something went wrong
          </Text>
          {this.props.where ? (
            <Text className="mt-1 text-xs text-muted-light dark:text-muted-dark">
              {this.props.where}
            </Text>
          ) : null}
        </View>

        <View className="rounded-2xl border border-border-light bg-panel-light p-4 dark:border-border-dark dark:bg-panel-dark">
          <Text className="font-mono text-[11px] text-text-light dark:text-text-dark">
            {this.state.err.message}
          </Text>
        </View>

        <PrimaryButton label="Try again" onPress={this.reset} fullWidth />
      </ScrollView>
    );
  }
}
