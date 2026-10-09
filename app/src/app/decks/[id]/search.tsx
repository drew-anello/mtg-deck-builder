import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge, Button, CardRow, Input, Page, Pill, WEB_TOP, WebBack, money } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { searchCards, cardKey, type Card } from '@/core/scryfall';
import { canBeCommander, copyLimitOverride, isBasicLand, sortColors } from '@/core/validate';
import { useOwned } from '@/hooks/use-owned';
import { useCards } from '@/store/cards';
import { allEntries, useCollection } from '@/store/collection';
import { useDecks } from '@/store/decks';

const PAGE_LOCAL = 60;

export default function SearchScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const pickingCommander = mode === 'commander';
  const deck = useDecks((s) => s.decks[id]);
  const adjust = useDecks((s) => s.adjust);
  const setCommanders = useDecks((s) => s.setCommanders);
  const cards = useCards((s) => s.cards);
  const put = useCards((s) => s.put);
  const sources = useCollection((s) => s.sources);
  const owned = useOwned();

  const [text, setText] = useState('');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [remote, setRemote] = useState<{ cards: Card[]; hasMore: boolean; total: number }>({ cards: [], hasMore: false, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Colors cards must fit inside (Commander only).
  const identity = useMemo(() => {
    if (!deck || deck.format !== 'commander' || pickingCommander) return null;
    const ids = new Set<string>();
    for (const n of deck.commanders) cards[cardKey(n)]?.colorIdentity.forEach((c) => ids.add(c));
    return deck.commanders.length > 0 ? sortColors(ids) : null;
  }, [deck, cards, pickingCommander]);

  const query = useMemo(() => {
    if (!deck) return '';
    const parts = [text.trim()];
    if (pickingCommander) parts.push('is:commander', 'legal:commander');
    else parts.push(`legal:${deck.format}`);
    if (identity) parts.push(`id<=${identity.length ? identity.join('') : 'c'}`);
    return parts.filter(Boolean).join(' ');
  }, [deck, text, pickingCommander, identity]);

  useEffect(() => {
    if (ownedOnly) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchCards(query, 1);
        if (mine !== seq.current) return;
        put(res.cards);
        setRemote(res);
        setPage(1);
      } catch (e) {
        if (mine === seq.current) setError((e as Error).message);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, text ? 400 : 0);
    return () => clearTimeout(t);
  }, [query, ownedOnly, put, text]);

  async function loadMore() {
    const mine = seq.current;
    setLoading(true);
    try {
      const res = await searchCards(query, page + 1);
      if (mine !== seq.current) return;
      put(res.cards);
      setRemote((r) => ({ ...res, cards: [...r.cards, ...res.cards] }));
      setPage(page + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Collection-first mode: search only the cards you own, entirely on-device.
  const local = useMemo(() => {
    if (!ownedOnly || !deck) return [];
    const q = text.trim().toLowerCase();
    const seen = new Set<string>();
    const out: Card[] = [];
    for (const e of allEntries(sources)) {
      const key = cardKey(e.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const c = cards[key];
      if (!c) continue;
      if (q && !c.name.toLowerCase().includes(q) && !c.typeLine.toLowerCase().includes(q) && !c.oracleText.toLowerCase().includes(q)) continue;
      const status = c.legalities[deck.format];
      if (status === 'banned' || status === 'not_legal') continue;
      if (pickingCommander && !canBeCommander(c)) continue;
      if (identity && c.colorIdentity.some((x) => !identity.includes(x))) continue;
      out.push(c);
    }
    return out.sort((a, b) => (a.edhrecRank ?? 1e9) - (b.edhrecRank ?? 1e9)).slice(0, PAGE_LOCAL);
  }, [ownedOnly, deck, text, sources, cards, identity, pickingCommander]);

  const results = ownedOnly ? local : remote.cards;

  const renderItem = useCallback(
    ({ item }: { item: Card }) => {
      if (!deck) return null;
      const key = cardKey(item.name);
      const inDeck = deck.main.find((c) => cardKey(c.name) === key)?.quantity ?? 0;
      const isCommander = deck.commanders.some((n) => cardKey(n) === key);
      const have = owned.get(key) ?? 0;
      // Singleton: no second copy of anything except basics and "any number" cards.
      const singletonFull =
        deck.format === 'commander' && inDeck >= 1 && !isBasicLand(item.name) && copyLimitOverride(item) === undefined;
      return (
        <CardRow
          imageUri={item.imageSmall}
          title={item.name}
          subtitle={`${item.manaCost ? item.manaCost + ' · ' : ''}${item.typeLine}`}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <View style={{ alignItems: 'flex-end' }}>
                {have > 0 ? <Badge label={`OWN ${have}`} color="success" /> : <Badge label="NOT OWNED" color="warning" />}
                <ThemedText type="small" themeColor="textSecondary">{money(item.priceUsd)}</ThemedText>
              </View>
              {pickingCommander ? (
                <View style={{ gap: Spacing.one }}>
                  <Button
                    label="Set"
                    onPress={() => {
                      setCommanders(deck.id, [item.name]);
                      router.back();
                    }}
                    style={{ minHeight: 32, paddingVertical: 4 }}
                  />
                  {deck.commanders.length === 1 && !isCommander ? (
                    <Button
                      label="+ Partner"
                      kind="secondary"
                      onPress={() => {
                        setCommanders(deck.id, [...deck.commanders, item.name]);
                        router.back();
                      }}
                      style={{ minHeight: 32, paddingVertical: 4 }}
                    />
                  ) : null}
                </View>
              ) : (
                <Button
                  label={isCommander ? 'Commander' : singletonFull ? 'In deck' : inDeck ? `+ (${inDeck})` : 'Add'}
                  kind={inDeck ? 'secondary' : 'primary'}
                  disabled={isCommander || singletonFull}
                  onPress={() => adjust(deck.id, item.name, 1)}
                  style={{ minHeight: 32, paddingVertical: 4, minWidth: 64 }}
                />
              )}
            </View>
          }
        />
      );
    },
    [deck, owned, pickingCommander, adjust, setCommanders],
  );

  if (!deck) return <ThemedText>This deck no longer exists.</ThemedText>;

  const empty = !loading && results.length === 0 && !error;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Page style={{ flex: 1, paddingTop: WEB_TOP + Spacing.three }}>
        <View style={{ gap: Spacing.two, paddingBottom: Spacing.two }}>
          <WebBack label={`← Back to ${deck.name}`} onPress={() => router.back()} />
          <Input
            placeholder={pickingCommander ? 'Search commanders' : 'Search cards (Scryfall syntax works: t:creature o:draw)'}
            value={text}
            onChangeText={setText}
            autoCapitalize="none"
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill label="All cards" selected={!ownedOnly} onPress={() => setOwnedOnly(false)} />
            <Pill label="Only cards I own" selected={ownedOnly} onPress={() => setOwnedOnly(true)} />
            {identity ? (
              <ThemedText type="small" themeColor="textSecondary">
                Colors: {identity.join('') || 'colorless'}
              </ThemedText>
            ) : null}
          </View>
          {!ownedOnly && !loading && remote.total > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {remote.total.toLocaleString()} results{text ? '' : ' · most popular first'}
            </ThemedText>
          ) : null}
          {ownedOnly && Object.keys(sources).length === 0 ? (
            <ThemedText type="small" themeColor="warning">Import your collection first (Collection tab).</ThemedText>
          ) : null}
          {error ? <ThemedText type="small" themeColor="danger">{error}</ThemedText> : null}
        </View>
        <FlatList
          data={results}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={empty ? <ThemedText themeColor="textSecondary">No matches.</ThemedText> : null}
          ListFooterComponent={
            !ownedOnly && remote.hasMore ? (
              <Button label="Load more" kind="secondary" onPress={loadMore} loading={loading} style={{ marginTop: Spacing.two }} />
            ) : loading ? (
              <ThemedText type="small" themeColor="textSecondary">Searching…</ThemedText>
            ) : null
          }
        />
      </Page>
    </SafeAreaView>
  );
}
