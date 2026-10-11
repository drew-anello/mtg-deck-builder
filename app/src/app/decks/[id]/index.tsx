import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, CardRow, Input, Page, WEB_TOP, WebBack, money } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { toPlainList } from '@/core/decklist';
import { toCardKingdomList, toTcgplayerMassEntry } from '@/core/massEntry';
import { findMissing } from '@/core/missing';
import { cardKey, tcgplayerSearchUrl, type Card as CardData } from '@/core/scryfall';
import { FORMAT_LABEL, type DeckCard } from '@/core/types';
import { validateDeck, type Deck } from '@/core/validate';
import { useOwned } from '@/hooks/use-owned';
import { CARD_KINGDOM_BUILDER_URL, TCGPLAYER_MASS_ENTRY_URL, copyText, openUrl } from '@/lib/links';
import { allEntries, useCollection } from '@/store/collection';
import { useCards } from '@/store/cards';
import { useDecks } from '@/store/decks';

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land'];

function groupOf(card: CardData | undefined): string {
  if (!card) return 'Unknown';
  // Check Land last-but-one so "Artifact Land" and "Enchantment Creature" group by their first matching type.
  for (const t of TYPE_ORDER) if (card.typeLine.includes(t)) return t;
  return 'Other';
}

export default function DeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deck = useDecks((s) => s.decks[id]);
  const rename = useDecks((s) => s.rename);
  const remove = useDecks((s) => s.remove);
  const setCommanders = useDecks((s) => s.setCommanders);
  const cards = useCards((s) => s.cards);
  const ensure = useCards((s) => s.ensure);
  const owned = useOwned();
  const sources = useCollection((s) => s.sources);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [includeOwned, setIncludeOwned] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Make sure we have card data for everything in the deck.
  const nameKey = deck ? [...deck.commanders, ...deck.main.map((c) => c.name), ...deck.sideboard.map((c) => c.name)].join('|') : '';
  useEffect(() => {
    if (!deck) return;
    ensure([...deck.commanders, ...deck.main.map((c) => c.name), ...deck.sideboard.map((c) => c.name)]).then(
      () => setLoadError(null),
      (e) => setLoadError((e as Error).message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameKey]);

  const lookup = (name: string) => cards[cardKey(name)];
  const validation = useMemo(() => (deck ? validateDeck(deck, lookup) : null), [deck, cards]); // eslint-disable-line react-hooks/exhaustive-deps

  const allCards: DeckCard[] = useMemo(
    () => (deck ? [...deck.commanders.map((name) => ({ name, quantity: 1 })), ...deck.main, ...deck.sideboard] : []),
    [deck],
  );
  const missing = useMemo(() => findMissing(allCards, allEntries(sources)), [allCards, sources]);
  const missingCost = missing.reduce((s, m) => s + (lookup(m.name)?.priceUsd ?? 0) * m.quantity, 0);

  const grouped = useMemo(() => {
    if (!deck) return [];
    const groups = new Map<string, DeckCard[]>();
    for (const c of deck.main) {
      const g = groupOf(cards[cardKey(c.name)]);
      groups.set(g, [...(groups.get(g) ?? []), c]);
    }
    const order = [...TYPE_ORDER, 'Other', 'Unknown'];
    return order
      .filter((g) => groups.has(g))
      .map((g) => ({
        title: g,
        cards: groups.get(g)!.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [deck, cards]);

  if (!deck || !validation) {
    return (
      <Page style={{ paddingTop: Spacing.four }}>
        <ThemedText>This deck no longer exists.</ThemedText>
      </Page>
    );
  }

  const exportList = includeOwned ? allCards : missing.map(({ name, quantity }) => ({ name, quantity }));

  async function buy(site: 'tcgplayer' | 'cardkingdom') {
    if (exportList.length === 0) {
      setNotice('Nothing to buy — you own every card in this deck.');
      return;
    }
    const text = site === 'tcgplayer' ? toTcgplayerMassEntry(exportList) : toCardKingdomList(exportList);
    // Start the copy and open the tab in the same tick: browsers (Safari especially) only allow
    // window.open during the user's click, and the clipboard needs this tab focused when it's called.
    const copied = copyText(text);
    const opened = openUrl(site === 'tcgplayer' ? TCGPLAYER_MASS_ENTRY_URL : CARD_KINGDOM_BUILDER_URL);
    const ok = await copied;
    setNotice(
      ok
        ? `Copied ${exportList.length} lines. Paste them into ${site === 'tcgplayer' ? 'TCGplayer Mass Entry' : 'the Card Kingdom Deck Builder'}.`
        : 'Couldn’t copy automatically — use “Copy decklist” and paste it in.',
    );
    await opened;
  }

  async function copyPlain() {
    setNotice((await copyText(toPlainList(allCards))) ? 'Full decklist copied.' : 'Couldn’t copy.');
  }

  const errorCount = validation.issues.filter((i) => i.severity === 'error').length;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Stack.Screen options={{ title: deck.name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingTop: WEB_TOP }}>
        <Page style={{ gap: Spacing.three, paddingTop: Spacing.three }}>
          <WebBack label="← All decks" onPress={() => router.replace('/decks')} />
          {/* Header */}
          <View style={{ gap: Spacing.one }}>
            {editingName ? (
              <Input
                defaultValue={deck.name}
                autoFocus
                onSubmitEditing={(e) => {
                  rename(deck.id, e.nativeEvent.text.trim() || deck.name);
                  setEditingName(false);
                }}
                onBlur={() => setEditingName(false)}
              />
            ) : (
              <Pressable onPress={() => setEditingName(true)}>
                <ThemedText type="subtitle">{deck.name}</ThemedText>
              </Pressable>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {FORMAT_LABEL[deck.format]} · {validation.total}/{validation.required}
              {validation.colorIdentity.length ? ` · ${validation.colorIdentity.join('')}` : ''}
            </ThemedText>
          </View>

          {/* Validation */}
          <Card>
            {validation.issues.length === 0 ? (
              <ThemedText type="smallBold" themeColor="success">
                ✓ Legal {FORMAT_LABEL[deck.format]} deck
              </ThemedText>
            ) : (
              <>
                <ThemedText type="smallBold" themeColor={errorCount ? 'danger' : 'warning'}>
                  {errorCount ? `${errorCount} problem${errorCount === 1 ? '' : 's'}` : 'Almost there'}
                </ThemedText>
                {validation.issues.map((issue, i) => (
                  <ThemedText key={i} type="small" themeColor={issue.severity === 'error' ? 'danger' : 'warning'}>
                    • {issue.message}
                  </ThemedText>
                ))}
              </>
            )}
            {loadError ? (
              <ThemedText type="small" themeColor="warning">
                Couldn’t load some card data: {loadError}
              </ThemedText>
            ) : null}
          </Card>

          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <Button
              label="Add cards"
              onPress={() => router.push({ pathname: '/decks/[id]/search', params: { id: deck.id } })}
              style={{ flex: 1 }}
            />
            {deck.format === 'commander' ? (
              <Button
                label={deck.commanders.length ? 'Change commander' : 'Pick commander'}
                kind="secondary"
                onPress={() => router.push({ pathname: '/decks/[id]/search', params: { id: deck.id, mode: 'commander' } })}
              />
            ) : null}
          </View>

          {/* Shopping */}
          <Card>
            <ThemedText type="smallBold">Buy what you’re missing</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {missing.length === 0
                ? 'You own every card in this deck.'
                : `${missing.reduce((s, m) => s + m.quantity, 0)} cards missing · about ${money(missingCost)}`}
              {Object.keys(sources).length === 0 ? ' (Import your collection to see what you already own.)' : ''}
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
              <Button label="TCGplayer Mass Entry" onPress={() => buy('tcgplayer')} style={{ flex: 1 }} />
              <Button label="Card Kingdom" onPress={() => buy('cardkingdom')} style={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
              <Button
                label={includeOwned ? 'Listing whole deck' : 'Listing missing only'}
                kind="secondary"
                onPress={() => setIncludeOwned((v) => !v)}
              />
              <Button label="Copy decklist" kind="secondary" onPress={copyPlain} />
            </View>
            {notice ? (
              <ThemedText type="small" themeColor="success">
                {notice}
              </ThemedText>
            ) : null}
          </Card>

          {/* Commanders */}
          {deck.format === 'commander' && deck.commanders.length > 0 ? (
            <Section title="Commander">
              {deck.commanders.map((name) => {
                const c = lookup(name);
                return (
                  <CardRow
                    key={name}
                    imageUri={c?.imageSmall}
                    title={name}
                    subtitle={c?.typeLine}
                    right={
                      <Button
                        label="Remove"
                        kind="secondary"
                        onPress={() => setCommanders(deck.id, deck.commanders.filter((n) => n !== name))}
                        style={{ minHeight: 30, paddingVertical: 4 }}
                      />
                    }
                  />
                );
              })}
            </Section>
          ) : null}

          {/* Main deck */}
          {grouped.map((g) => (
            <Section key={g.title} title={`${g.title} (${g.cards.reduce((s, c) => s + c.quantity, 0)})`}>
              {g.cards.map((c) => (
                <DeckLine key={c.name} deck={deck} card={c} data={lookup(c.name)} owned={owned.get(cardKey(c.name)) ?? 0} />
              ))}
            </Section>
          ))}
          {deck.main.length === 0 ? (
            <ThemedText themeColor="textSecondary">No cards yet. Tap “Add cards” to search Scryfall.</ThemedText>
          ) : null}

          {deck.sideboard.length > 0 ? (
            <Section title={`Sideboard (${deck.sideboard.reduce((s, c) => s + c.quantity, 0)})`}>
              {deck.sideboard.map((c) => (
                <DeckLine key={c.name} deck={deck} card={c} data={lookup(c.name)} owned={owned.get(cardKey(c.name)) ?? 0} board="sideboard" />
              ))}
            </Section>
          ) : null}

          <Button
            label="Delete deck"
            kind="danger"
            onPress={() => {
              remove(deck.id);
              router.replace('/decks');
            }}
            style={{ marginTop: Spacing.four }}
          />
        </Page>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginBottom: Spacing.one }}>
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function DeckLine({
  deck,
  card,
  data,
  owned,
  board = 'main',
}: {
  deck: Deck;
  card: DeckCard;
  data: CardData | undefined;
  owned: number;
  board?: 'main' | 'sideboard';
}) {
  const adjust = useDecks((s) => s.adjust);
  const short = card.quantity - owned;
  const basic = /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest)$|^Wastes$/.test(card.name);
  const buyUrl = data?.tcgplayerUrl ?? tcgplayerSearchUrl(card.name);
  return (
    <CardRow
      imageUri={data?.imageSmall}
      title={card.name}
      subtitle={[data?.manaCost, basic ? null : short > 0 ? `own ${owned}/${card.quantity}` : 'owned'].filter(Boolean).join(' · ')}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          {!basic && short > 0 ? (
            <Pressable onPress={() => openUrl(buyUrl)} accessibilityLabel={`Buy ${card.name}`}>
              <Badge label={`BUY ${money(data?.priceUsd)}`} color="accent" />
            </Pressable>
          ) : null}
          <Stepper onMinus={() => adjust(deck.id, card.name, -1, board)} onPlus={() => adjust(deck.id, card.name, 1, board)} value={card.quantity} />
        </View>
      }
    />
  );
}

function Stepper({ value, onMinus, onPlus }: { value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
      <Pressable onPress={onMinus} hitSlop={8} accessibilityLabel="Remove one">
        <ThemedText type="subtitle" style={{ fontSize: 24, lineHeight: 28, width: 24, textAlign: 'center' }}>−</ThemedText>
      </Pressable>
      <ThemedText type="smallBold" style={{ minWidth: 18, textAlign: 'center' }}>{value}</ThemedText>
      <Pressable onPress={onPlus} hitSlop={8} accessibilityLabel="Add one">
        <ThemedText type="subtitle" style={{ fontSize: 24, lineHeight: 28, width: 24, textAlign: 'center' }}>+</ThemedText>
      </Pressable>
    </View>
  );
}
