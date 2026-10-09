import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Page, Pill, WEB_TOP } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { mergeDuplicates, parseDecklist } from '@/core/decklist';
import { FORMAT_LABEL, type Format } from '@/core/types';
import { validateDeck, type Deck } from '@/core/validate';
import { cardKey, type Card as CardData } from '@/core/scryfall';
import { useCards } from '@/store/cards';
import { useDecks } from '@/store/decks';

export default function DecksScreen() {
  const decks = useDecks((s) => s.decks);
  const createDeck = useDecks((s) => s.create);
  const cards = useCards((s) => s.cards);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<Format>('commander');
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => Object.values(decks).sort((a, b) => b.updatedAt - a.updatedAt), [decks]);

  async function onCreate() {
    setError(null);
    setBusy(true);
    try {
      const parsed = pasted.trim() ? parseDecklist(pasted) : null;
      const id = createDeck(name, format, parsed
        ? {
            commanders: format === 'commander' ? parsed.commanders.map((c) => c.name).slice(0, 2) : [],
            main: mergeDuplicates(parsed.main),
            sideboard: format === 'commander' ? [] : mergeDuplicates(parsed.sideboard),
          }
        : undefined);
      if (parsed) {
        // Validation and the card rows need card data; fetch it in the background.
        const names = [...parsed.commanders, ...parsed.main, ...parsed.sideboard].map((c) => c.name);
        useCards.getState().ensure(names).catch(() => {});
      }
      setCreating(false);
      setName('');
      setPasted('');
      router.push({ pathname: '/decks/[id]', params: { id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View style={{ gap: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.three }}>
      <ThemedText type="subtitle">Decks</ThemedText>
      {creating ? (
        <Card>
          <Input placeholder="Deck name" value={name} onChangeText={setName} autoFocus />
          <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
            {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
              <Pill key={f} label={FORMAT_LABEL[f]} selected={format === f} onPress={() => setFormat(f)} />
            ))}
          </View>
          <Input
            placeholder="Optional: paste a decklist (Moxfield, Archidekt, Arena, …)"
            value={pasted}
            onChangeText={setPasted}
            multiline
            autoCapitalize="none"
          />
          {error ? <ThemedText type="small" themeColor="danger">{error}</ThemedText> : null}
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Button label="Create deck" onPress={onCreate} loading={busy} style={{ flex: 1 }} />
            <Button label="Cancel" kind="secondary" onPress={() => setCreating(false)} />
          </View>
        </Card>
      ) : (
        <Button label="New deck" onPress={() => setCreating(true)} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <Page style={{ flex: 1, paddingTop: WEB_TOP }}>
        <FlatList
          data={list}
          keyExtractor={(d) => d.id}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary">No decks yet. Create one to get started.</ThemedText>
          }
          contentContainerStyle={{ paddingBottom: 120, gap: Spacing.two }}
          renderItem={({ item }) => <DeckRow deck={item} cards={cards} />}
        />
      </Page>
    </SafeAreaView>
  );
}

function DeckRow({ deck, cards }: { deck: Deck; cards: Record<string, CardData> }) {
  const result = useMemo(() => validateDeck(deck, (n) => cards[cardKey(n)]), [deck, cards]);
  const errors = result.issues.filter((i) => i.severity === 'error').length;
  return (
    <Link href={{ pathname: '/decks/[id]', params: { id: deck.id } }} asChild>
      <Pressable>
        <Card>
          <ThemedText type="smallBold">{deck.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {FORMAT_LABEL[deck.format]} · {result.total}/{result.required}
            {deck.commanders.length ? ` · ${deck.commanders.join(' & ')}` : ''}
          </ThemedText>
          {errors > 0 ? (
            <ThemedText type="small" themeColor="danger">
              {errors} issue{errors === 1 ? '' : 's'}
            </ThemedText>
          ) : null}
        </Card>
      </Pressable>
    </Link>
  );
}
