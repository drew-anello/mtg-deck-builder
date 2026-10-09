import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, CardRow, Input, Page, WEB_TOP, money } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { cardKey } from '@/core/scryfall';
import { pickTextFiles } from '@/lib/readPicked';
import { allEntries, useCollection } from '@/store/collection';
import { useCards } from '@/store/cards';

interface Row {
  key: string;
  name: string;
  qty: number;
  foil: number;
}

export default function CollectionScreen() {
  const sources = useCollection((s) => s.sources);
  const progress = useCollection((s) => s.progress);
  const importCsv = useCollection((s) => s.importCsv);
  const removeSource = useCollection((s) => s.removeSource);
  const cards = useCards((s) => s.cards);

  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshStale = useCards((s) => s.refreshStale);

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, Row>();
    for (const e of allEntries(sources)) {
      const key = cardKey(e.name);
      const row = byKey.get(key) ?? { key, name: e.name, qty: 0, foil: 0 };
      row.qty += e.quantity;
      if (e.foil) row.foil += e.quantity;
      byKey.set(key, row);
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [sources]);

  const stats = useMemo(() => {
    let total = 0;
    let value = 0;
    let oldest = Infinity;
    for (const r of rows) {
      total += r.qty;
      const c = cards[r.key];
      if (c) {
        value += (r.qty - r.foil) * (c.priceUsd ?? 0) + r.foil * (c.priceUsdFoil ?? c.priceUsd ?? 0);
        oldest = Math.min(oldest, c.fetchedAt ?? 0);
      }
    }
    return { unique: rows.length, total, value, oldest: Number.isFinite(oldest) ? oldest : undefined };
  }, [rows, cards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  async function onImport() {
    setMessage(null);
    setBusy(true);
    try {
      const files = await pickTextFiles();
      let imported = 0;
      let notFound = 0;
      for (const f of files) {
        const r = await importCsv(f.name, f.text);
        imported += r.cards;
        notFound += r.notFound;
      }
      if (files.length > 0) {
        setMessage({
          text: `Imported ${imported} rows from ${files.length} file${files.length === 1 ? '' : 's'}${notFound ? `; ${notFound} cards weren't found on Scryfall` : ''}.`,
        });
      }
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      // Force a refresh of everything, not just cards older than a day.
      const n = await refreshStale(0);
      setMessage({ text: n ? `Updated prices for ${n} cards.` : 'Nothing to update.' });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setRefreshing(false);
    }
  }

  const sourceNames = Object.keys(sources);

  const header = (
    <View style={{ gap: Spacing.three, paddingBottom: Spacing.three, paddingTop: Spacing.three }}>
      <ThemedText type="subtitle">Collection</ThemedText>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          Export a binder or list from ManaBox (Collection tab → menu → Export), then import the CSV here.
          Import more than one file to combine binders; importing the same file name again replaces it.
        </ThemedText>
        <Button
          label={sourceNames.length ? 'Import another CSV' : 'Import ManaBox CSV'}
          onPress={onImport}
          loading={busy}
        />
        <Button label="Add cards by hand" kind="secondary" onPress={() => router.push('/collection/add')} />
        {progress ? (
          <ThemedText type="small" themeColor="textSecondary">
            Loading card data… {progress.done}/{progress.total}
          </ThemedText>
        ) : null}
        {message ? (
          <ThemedText type="small" themeColor={message.error ? 'danger' : 'success'}>
            {message.text}
          </ThemedText>
        ) : null}
        {sourceNames.map((name) => (
          <View key={name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>
              {name} · {sources[name].length} rows
            </ThemedText>
            <Button label="Remove" kind="secondary" onPress={() => removeSource(name)} style={{ minHeight: 30, paddingVertical: 4 }} />
          </View>
        ))}
      </Card>
      {rows.length > 0 ? (
        <>
          <View style={{ flexDirection: 'row', gap: Spacing.four }}>
            <Stat label="Unique" value={String(stats.unique)} />
            <Stat label="Total cards" value={String(stats.total)} />
            <Stat label="Est. value" value={money(stats.value)} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
              Prices from Scryfall (TCGplayer market){stats.oldest ? `, as of ${timeAgo(stats.oldest)}` : ''}. Refreshed daily.
            </ThemedText>
            <Button label="Refresh" kind="secondary" onPress={onRefresh} loading={refreshing} style={{ minHeight: 30, paddingVertical: 4 }} />
          </View>
          <Input placeholder="Search your collection" value={query} onChangeText={setQuery} />
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <Page style={{ flex: 1, paddingTop: WEB_TOP }}>
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.key}
          ListHeaderComponent={header}
          ListEmptyComponent={
            rows.length > 0 ? <ThemedText themeColor="textSecondary">No cards match “{query}”.</ThemedText> : null
          }
          initialNumToRender={20}
          windowSize={8}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }) => {
            const c = cards[item.key];
            return (
              <CardRow
                imageUri={c?.imageSmall}
                title={item.name}
                subtitle={c ? c.typeLine : 'Loading…'}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <ThemedText type="smallBold">×{item.qty}</ThemedText>
                    {item.foil > 0 ? <Badge label={`${item.foil} foil`} color="accent" /> : null}
                    <ThemedText type="small" themeColor="textSecondary">
                      {money(c?.priceUsd)}
                    </ThemedText>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <ThemedText type="smallBold">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function timeAgo(ms: number): string {
  if (!ms) return 'an unknown time ago';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 120) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}
