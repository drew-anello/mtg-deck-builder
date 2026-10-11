import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, CardRow, Input, Page, Pill, WEB_TOP, WebBack, money } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { autoBuild } from '@/core/autobuild';
import type { BuildResult, Category, Pick } from '@/core/builder';
import { BRACKET_LABEL } from '@/core/combos';
import { cardKey, searchCards, type Card as CardData } from '@/core/scryfall';
import { canBeCommander, sortColors } from '@/core/validate';
import { useOwned } from '@/hooks/use-owned';
import { toPlainList } from '@/core/decklist';
import { copyText, openUrl } from '@/lib/links';
import { useCards } from '@/store/cards';
import { useDecks } from '@/store/decks';

type Mode = 'owned' | 'any';

const CATEGORY_TITLE: Record<Category, string> = {
  combo: 'Combos',
  ramp: 'Ramp',
  draw: 'Card draw',
  removal: 'Removal',
  wipe: 'Board wipes',
  synergy: 'Synergy with your commander',
  staple: 'Popular staples',
  land: 'Lands',
  basic: 'Basic lands',
};
const CATEGORY_ORDER: Category[] = ['combo', 'ramp', 'draw', 'removal', 'wipe', 'synergy', 'staple', 'land', 'basic'];

export default function BuildScreen() {
  const cards = useCards((s) => s.cards);
  const put = useCards((s) => s.put);
  const createDeck = useDecks((s) => s.create);
  const owned = useOwned();

  const [commander, setCommander] = useState<CardData | null>(null);
  const [search, setSearch] = useState('');
  const [remote, setRemote] = useState<CardData[]>([]);
  const [mode, setMode] = useState<Mode>('any');
  const [comboCount, setComboCount] = useState(2);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<{ result: BuildResult; warnings: string[]; mode: Mode } | null>(null);
  const seq = useRef(0);

  const ownedCards = useMemo(() => Object.values(cards).filter((c) => owned.has(cardKey(c.name))), [cards, owned]);

  // Commanders you own, filtered by the search box.
  const ownedCommanders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ownedCards
      .filter((c) => canBeCommander(c) && c.legalities.commander === 'legal' && (!q || c.name.toLowerCase().includes(q)))
      .sort((a, b) => (a.edhrecRank ?? 1e9) - (b.edhrecRank ?? 1e9))
      .slice(0, 30);
  }, [ownedCards, search]);

  // Any commander on Scryfall, once the user types something.
  useEffect(() => {
    const q = search.trim();
    const mine = ++seq.current;
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      try {
        const res = await searchCards(`${q} is:commander legal:commander`, 1);
        if (mine !== seq.current) return;
        put(res.cards);
        setRemote(res.cards.slice(0, 15));
      } catch {
        if (mine === seq.current) setRemote([]);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [search, put]);

  const remoteShown = search.trim().length >= 2 ? remote.filter((c) => !owned.has(cardKey(c.name))) : [];

  async function onBuild() {
    if (!commander) return;
    setError(null);
    setOutput(null);
    setStatus('Starting…');
    try {
      const out = await autoBuild({
        commander,
        mode,
        comboCount,
        ownedCards,
        ownedCounts: owned,
        onStatus: setStatus,
      });
      put(out.result.picks.flatMap((p) => (p.card ? [p.card] : [])));
      setOutput({ ...out, mode });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus(null);
    }
  }

  function onCreate() {
    if (!output || !commander) return;
    const { result } = output;
    const id = createDeck(`${commander.name.split(',')[0]} (from my collection)`, 'commander', {
      commanders: [commander.name],
      main: result.picks.map((p) => ({ name: p.name, quantity: p.quantity })),
    });
    router.replace({ pathname: '/decks/[id]', params: { id } });
  }

  const building = status !== null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingTop: WEB_TOP }} keyboardShouldPersistTaps="handled">
        <Page style={{ gap: Spacing.three, paddingTop: Spacing.three }}>
          <WebBack label="← All decks" onPress={() => router.replace('/decks')} />
          <ThemedText type="subtitle">Build from my collection</ThemedText>

          {output ? (
            <Result
              output={output}
              commander={commander!}
              onCreate={onCreate}
              onBack={() => setOutput(null)}
            />
          ) : (
            <>
              {/* 1. Commander */}
              <Card>
                <ThemedText type="smallBold">1. Commander</ThemedText>
                {commander ? (
                  <CardRow
                    imageUri={commander.imageSmall}
                    title={commander.name}
                    subtitle={`${commander.typeLine} · ${sortColors(commander.colorIdentity).join('') || 'colorless'}`}
                    right={<Button label="Change" kind="secondary" onPress={() => setCommander(null)} style={{ minHeight: 30, paddingVertical: 4 }} />}
                  />
                ) : (
                  <>
                    <Input placeholder="Search commanders (yours are listed first)" value={search} onChangeText={setSearch} autoCapitalize="none" />
                    {ownedCommanders.length === 0 && remoteShown.length === 0 ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {ownedCards.length === 0 ? 'Import your collection to see commanders you own, or search for any commander.' : 'No matches.'}
                      </ThemedText>
                    ) : null}
                    {ownedCommanders.map((c) => (
                      <CommanderRow key={c.id} card={c} owned onPick={() => setCommander(c)} />
                    ))}
                    {remoteShown.map((c) => (
                      <CommanderRow key={c.id} card={c} owned={false} onPick={() => setCommander(c)} />
                    ))}
                  </>
                )}
              </Card>

              {/* 2. Options */}
              <Card>
                <ThemedText type="smallBold">2. Which cards can it use?</ThemedText>
                <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
                  <Pill label="Only cards I own" selected={mode === 'owned'} onPress={() => setMode('owned')} />
                  <Pill label="Mine + buy the rest" selected={mode === 'any'} onPress={() => setMode('any')} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {mode === 'owned'
                    ? 'Builds only from your collection. If it runs short, the deck will have empty slots you can fill later.'
                    : 'Uses your cards first, then fills gaps with popular cards in your commander’s colors. Missing cards get buy links.'}
                </ThemedText>

                <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>3. Combos</ThemedText>
                <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
                  <Pill label="None" selected={comboCount === 0} onPress={() => setComboCount(0)} />
                  <Pill label="Up to 2" selected={comboCount === 2} onPress={() => setComboCount(2)} />
                  <Pill label="Up to 4" selected={comboCount === 4} onPress={() => setComboCount(4)} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Infinite and win-the-game combos from Commander Spellbook. Pick “None” for a more casual table.
                </ThemedText>
              </Card>

              <Button label={building ? (status ?? 'Building…') : 'Build deck'} onPress={onBuild} disabled={!commander} loading={building} />
              {error ? <ThemedText type="small" themeColor="danger">{error}</ThemedText> : null}
            </>
          )}
        </Page>
      </ScrollView>
    </SafeAreaView>
  );
}

function CommanderRow({ card, owned, onPick }: { card: CardData; owned: boolean; onPick: () => void }) {
  return (
    <Pressable onPress={onPick} accessibilityRole="button" accessibilityLabel={`Choose ${card.name}`}>
      <CardRow
        imageUri={card.imageSmall}
        title={card.name}
        subtitle={`${sortColors(card.colorIdentity).join('') || 'colorless'} · ${card.typeLine}`}
        right={owned ? <Badge label="OWN" color="success" /> : <Badge label={money(card.priceUsd)} color="textSecondary" />}
      />
    </Pressable>
  );
}

function Result({
  output,
  commander,
  onCreate,
  onBack,
}: {
  output: { result: BuildResult; warnings: string[]; mode: Mode };
  commander: CardData;
  onCreate: () => void;
  onBack: () => void;
}) {
  const { result, warnings } = output;
  const [copied, setCopied] = useState(false);
  const stats = useMemo(() => {
    let ownedCount = 0;
    let missing = 0;
    let cost = 0;
    for (const p of result.picks) {
      const have = p.category === 'basic' ? p.quantity : Math.min(p.owned, p.quantity);
      ownedCount += have;
      const need = p.quantity - have;
      missing += need;
      cost += need * (p.card?.priceUsd ?? 0);
    }
    return { ownedCount, missing, cost };
  }, [result]);

  const groups = CATEGORY_ORDER.map((c) => ({ category: c, picks: result.picks.filter((p) => p.category === c) })).filter((g) => g.picks.length > 0);

  return (
    <>
      <Card>
        <ThemedText type="smallBold">{commander.name}</ThemedText>
        <ThemedText type="small">
          {result.total}/100 cards · you own {stats.ownedCount} · {stats.missing} to buy (about {money(stats.cost)})
        </ThemedText>
        {result.themes.length ? (
          <ThemedText type="small" themeColor="textSecondary">Themes detected: {result.themes.join(', ')}</ThemedText>
        ) : null}
        {result.shortBy > 0 ? (
          <ThemedText type="small" themeColor="warning">
            {result.shortBy} slots are empty because your collection didn’t have enough on-color cards. Go back and choose “Mine + buy the rest” to fill them.
          </ThemedText>
        ) : null}
        {warnings.map((w, i) => (
          <ThemedText key={i} type="small" themeColor="warning">{w}</ThemedText>
        ))}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <Button label="Create this deck" onPress={onCreate} style={{ flex: 1 }} />
          <Button label="Change options" kind="secondary" onPress={onBack} />
        </View>
        <Button
          label={copied ? 'Copied!' : 'Copy decklist'}
          kind="secondary"
          onPress={async () => {
            const list = toPlainList([{ name: commander.name, quantity: 1 }, ...result.picks.map((p) => ({ name: p.name, quantity: p.quantity }))]);
            if (await copyText(list)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
        />
      </Card>

      {result.combos.length > 0 ? (
        <Card>
          <ThemedText type="smallBold">Combos included</ThemedText>
          {result.combos.map((c) => (
            <View key={c.id} style={{ gap: 2 }}>
              <ThemedText type="small">
                {c.cards.join(' + ')} → {c.produces.slice(0, 3).join(', ') || 'combo'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {BRACKET_LABEL[c.bracketTag] ?? 'Unrated'}
              </ThemedText>
            </View>
          ))}
          <Pressable onPress={() => openUrl('https://commanderspellbook.com')}>
            <ThemedText type="small" themeColor="accent">Combo data from Commander Spellbook ↗</ThemedText>
          </Pressable>
        </Card>
      ) : null}

      {groups.map((g) => (
        <View key={g.category}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginBottom: Spacing.one }}>
            {CATEGORY_TITLE[g.category].toUpperCase()} ({g.picks.reduce((s, p) => s + p.quantity, 0)})
          </ThemedText>
          {g.picks.map((p) => (
            <PickRow key={p.name} pick={p} />
          ))}
        </View>
      ))}
    </>
  );
}

function PickRow({ pick }: { pick: Pick }) {
  const free = pick.category === 'basic' || pick.owned >= pick.quantity;
  return (
    <CardRow
      imageUri={pick.card?.imageSmall}
      title={pick.quantity > 1 ? `${pick.quantity}× ${pick.name}` : pick.name}
      subtitle={pick.reason}
      right={
        free ? (
          <Badge label={pick.category === 'basic' ? '' : 'OWN'} color="success" />
        ) : (
          <Badge label={`BUY ${money(pick.card?.priceUsd)}`} color="warning" />
        )
      }
    />
  );
}
