import { Image } from 'expo-image';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Top padding on web clears the floating tab bar. */
export const WEB_TOP = Platform.OS === 'web' ? 88 : 0;

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const bg = kind === 'primary' ? theme.accent : kind === 'danger' ? theme.danger : theme.backgroundSelected;
  const fg = kind === 'secondary' ? theme.text : '#ffffff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <ThemedText type="smallBold" style={{ color: fg }}>{label}</ThemedText>}
    </Pressable>
  );
}

export function Pill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        { backgroundColor: selected ? theme.accent : theme.backgroundElement },
      ]}>
      <ThemedText type="small" style={{ color: selected ? '#ffffff' : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      autoCorrect={false}
      {...props}
      style={[
        styles.input,
        { backgroundColor: theme.backgroundElement, color: theme.text },
        props.multiline && { minHeight: 120, textAlignVertical: 'top' },
        props.style,
      ]}
    />
  );
}

export function Badge({ label, color }: { label: string; color: ThemeColor }) {
  const theme = useTheme();
  return (
    <ThemedText type="small" style={{ color: theme[color], fontSize: 12, fontWeight: '700' }}>
      {label}
    </ThemedText>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]}>
      {children}
    </ThemedView>
  );
}

/** Thumbnail + text row used for cards in the collection, deck and search lists. */
export function CardRow({
  imageUri,
  title,
  subtitle,
  right,
}: {
  imageUri?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Image source={imageUri ? { uri: imageUri } : undefined} style={styles.thumb} contentFit="cover" transition={150} />
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function money(n: number | undefined): string {
  return n === undefined ? '—' : `$${n.toFixed(2)}`;
}

/** Back link for web, where the stack header is hidden. Renders nothing on native. */
export function WebBack({ label = '← Back', onPress }: { label?: string; onPress: () => void }) {
  if (Platform.OS !== 'web') return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={{ alignSelf: 'flex-start' }}>
      <ThemedText type="small" themeColor="accent">
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Centered, width-capped page container. */
export function Page({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.page, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  pill: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
  },
  rowText: { flex: 1, minWidth: 0 },
  thumb: { width: 36, height: 50, borderRadius: 3, backgroundColor: '#8884' },
  page: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
});
