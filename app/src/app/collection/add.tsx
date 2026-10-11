import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, CardRow, Input, Page, WEB_TOP, WebBack, money } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { cardKey, searchCards, type Card } from '@/core/scryfall';
import { useOwned } from '@/hooks/use-owned';
import { useCards } from '@/store/cards';
import { MANUAL_SOURCE, useCollection } from '@/store/collection';

/** Add cards to the collection by hand (new pickups since your last ManaBox export). */
export default function AddToCollectionScreen() {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const put = useCards((s) => s.put);
  const manual = useCollection((s) => s.sources[MANUAL_SOURCE]);
  const adjustManual = useCollection((s) => s.adjustManual);
  const owned = useOwned();

  const manualCounts = useMemo(() => new Map((manual ?? []).map((e) => [e.scryfallId, e.quantity])), [manual]);

  useEffect(() => {
    const q = text.trim();
    const mine = ++seq.current;
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchCards(q, 1);
        if (mine !== seq.current) return;
        put(res.cards);
        setResults(res.cards);
      } catch (e) {
        if (mine === seq.current) setError((e as Error).message);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [text, put]);

  const shown = text.trim().length >= 2 ? results : [];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Page style={{ flex: 1, paddingTop: WEB_TOP + Spacing.three }}>
        <View style={{ gap: Spacing.two, paddingBottom: Spacing.two }}>
          <WebBack label="← Back to collection" onPress={() => router.back()} />
          <Input placeholder="Search for a card to add" value={text} onChangeText={setText} autoCapitalize="none" autoFocus />
          <ThemedText type="small" themeColor="textSecondary">
            Cards you add here are kept separately from your ManaBox imports, so re-importing never removes them. If you
            also add the same card in ManaBox, re-export and remove it here to avoid counting it twice.
          </ThemedText>
          {error ? <ThemedText type="small" themeColor="danger">{error}</ThemedText> : null}
        </View>
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary">
              {loading ? 'Searching…' : text.trim().length >= 2 ? 'No matches.' : 'Type at least two letters.'}
            </ThemedText>
          }
          renderItem={({ item }) => {
            const added = manualCounts.get(item.id) ?? 0;
            const total = owned.get(cardKey(item.name)) ?? 0;
            return (
              <CardRow
                imageUri={item.imageSmall}
                title={item.name}
                subtitle={`${item.set.toUpperCase()} #${item.collectorNumber} · ${money(item.priceUsd)}${total ? ` · you own ${total}` : ''}`}
                right={
                  <View style={{ flexDirection: 'row', gap: Spacing.one, alignItems: 'center' }}>
                    {added > 0 ? (
                      <Button label="−" kind="secondary" onPress={() => adjustManual(item, -1)} style={{ minHeight: 32, paddingVertical: 4, minWidth: 36 }} />
                    ) : null}
                    {added > 0 ? <ThemedText type="smallBold">{added}</ThemedText> : null}
                    <Button label={added > 0 ? '+' : 'Add'} onPress={() => adjustManual(item, 1)} style={{ minHeight: 32, paddingVertical: 4, minWidth: 44 }} />
                  </View>
                }
              />
            );
          }}
        />
      </Page>
    </SafeAreaView>
  );
}
