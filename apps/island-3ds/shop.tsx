// The shop at the stall on the touch screen, as in the browser (src/ui/shop.ts), with three tabs:
//
//   Buy       the tools, and ten more pockets while there are more to sew on
//   Sell      the pockets, the chosen one's price today (the day's kind fetches half as much
//             again): what is set out on the counter is sold together
//   Savings   the wallet and the savings, coins between them
//
// Mori says the rest on the upper screen (src/npc/mori.ts, ./talk.tsx): hello, what a thing costs
// before it is bought, what all that is set out fetches before it is paid for, and goodbye.
//
// The pad: L and R change tab; in Buy up and down choose and A buys; in Sell the +Control Pad
// chooses, A sets it out (or takes it back) and Y sells what is set out; in Savings left and right
// choose how much, A deposits and Y withdraws. B leaves, after goodbye. The rules are the core's
// (src/core/things.ts shop).
import { createSignal, For, Index, onCleanup, Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { shop } from "../../src/core/things.ts";
import { formatCoins, itemDef } from "../../src/items/items.ts";
import { AMOUNTS, moriSays, saleTotal, type Sale } from "../../src/npc/mori.ts";
import { carriedPicture, picture } from "./catalog.ts";
import * as E from "./editor.ts";
import * as O from "./outdoors.ts";
import { Pill, Scroll, Sheet, TabStrip, Tap } from "./parts.tsx";
import { CREAM_2, INK, INK_SOFT, PAPER, SUN, SUN_DARK, tint } from "./theme.ts";

type ShopTab = "buy" | "sell" | "savings";
const TABS: ShopTab[] = ["buy", "sell", "savings"];
const CELL = 30, GAP = 3, COLUMNS = 9;

/** The shop's answer to the pad while it is open (sheets.tsx sheetPress asks it first). */
export let shopPad: ((pressed: number) => boolean) | null = null;

export function ShopSheet() {
  const [tab, setTab] = createSignal<ShopTab>("buy");
  const [focus, setFocus] = createSignal(0);
  const [amount, setAmount] = createSignal(1);
  // The coins, the stock and the pockets are the core's, read again as they change (O.sync).
  const { money, stock } = O;
  // What is set out on the counter to sell: each pocket and how many of it.
  const [counter, setCounter] = createSignal<Sale[]>([]);
  moriSays.hello(E.tr);
  const pockets = () => O.slots().pockets;
  const changed = () => {
    O.sync();
    O.keepThings();
  };
  const switchTab = (t: ShopTab) => {
    setTab(t);
    setFocus(0);
    setCounter([]);
  };
  const leave = () => moriSays.bye(() => E.openSheet(null), E.tr);

  const buy = (k: number) => moriSays.buy(k, changed, E.tr);
  /** Pocket `k` set out on the counter, or taken back. */
  const toggle = (k: number) => {
    const s = pockets()[k];
    if (!s?.item || !shop.price(s.item)) return;
    setCounter(counter().some((c) => c.slot === k) ? counter().filter((c) => c.slot !== k) : [...counter(), { slot: k, count: s.count }]);
  };
  const sell = () => moriSays.sell(counter(), pockets(), () => {
    setCounter([]);
    changed();
  }, E.tr);
  const deposit = () => moriSays.bank(AMOUNTS[amount()]!, false, changed, E.tr);
  const withdraw = () => moriSays.bank(AMOUNTS[amount()]!, true, changed, E.tr);

  onCleanup(() => {
    shopPad = null;
  });
  shopPad = (pressed) => {
    if (pressed & BTN.CROSS) leave();
    else if (pressed & (BTN.LTRIGGER | BTN.RTRIGGER)) {
      const at = TABS.indexOf(tab()) + (pressed & BTN.RTRIGGER ? 1 : -1);
      switchTab(TABS[(at + TABS.length) % TABS.length]!);
    } else if (tab() === "buy") {
      if (pressed & BTN.UP) setFocus(Math.max(0, focus() - 1));
      else if (pressed & BTN.DOWN) setFocus(Math.min(stock().length - 1, focus() + 1));
      else if (pressed & BTN.CIRCLE) buy(focus());
      else return false;
    } else if (tab() === "sell") {
      const n = pockets().length;
      if (pressed & BTN.RIGHT) setFocus(Math.min(n - 1, focus() + 1));
      else if (pressed & BTN.LEFT) setFocus(Math.max(0, focus() - 1));
      else if (pressed & BTN.DOWN) setFocus(Math.min(n - 1, focus() + COLUMNS));
      else if (pressed & BTN.UP) setFocus(Math.max(0, focus() - COLUMNS));
      else if (pressed & BTN.CIRCLE) toggle(focus());
      else if (pressed & BTN.SQUARE) sell();
      else return false;
    } else {
      if (pressed & BTN.RIGHT) setAmount(Math.min(AMOUNTS.length - 1, amount() + 1));
      else if (pressed & BTN.LEFT) setAmount(Math.max(0, amount() - 1));
      else if (pressed & BTN.CIRCLE) deposit();
      else if (pressed & BTN.SQUARE) withdraw();
      else return false;
    }
    return true;
  };

  const wallet = (
    <View class="flex-row items-center gap-1 rounded-xl px-2" style={{ height: 22, bgColor: CREAM_2 }}>
      <Image src={picture("ui:coin")} style={{ width: 16, height: 16 }} />
      <Text class="text-xs font-bold" style={{ textColor: INK }}>{formatCoins(money().wallet)}</Text>
    </View>
  );

  return (
    <Sheet title={E.tr("shop.title")} onClose={leave} right={wallet}>
      <View class="absolute" style={{ insetL: 6, insetT: 6 }}>
        <TabStrip items={TABS.map((t) => ({ value: t, label: E.tr(`shop.${t}`) }))} value={tab()} width={308} onPick={switchTab} />
      </View>
      <View class="absolute" style={{ insetL: 0, insetT: 36, width: 320, height: 174 }}>
        <Show when={tab() === "buy"}>
          <View class="flex-col items-center gap-1" style={{ width: 320, height: 150 }}>
            <For each={stock()}>
              {(o, k) => {
                const def = itemDef(o.item);
                const sub = () => (o.pockets ? E.tr("shop.upgrade", { from: pockets().length, to: o.pockets }) : "");
                return (
                  <Tap onTap={() => setFocus(k())} class="flex-row items-center gap-2 rounded-xl px-2" style={{ width: 308, height: 32, bgColor: focus() === k() ? CREAM_2 : PAPER, borderWidth: focus() === k() ? 2 : 0, borderColor: SUN }}>
                    <Image src={picture(`item:${o.item}`)} style={{ width: 28, height: 28 }} />
                    <View class="flex-col" style={{ width: 132 }}>
                      <Text class="text-xs font-bold" style={{ textColor: INK }}>{def ? E.pocketNameOf(def) : ""}</Text>
                      <Show when={sub()}><Text class="text-2xs" style={{ textColor: INK_SOFT }}>{sub()}</Text></Show>
                    </View>
                    <View class="flex-row items-center justify-end gap-1" style={{ width: 64 }}>
                      <Image src={picture("ui:coin")} style={{ width: 14, height: 14 }} />
                      <Text class="text-xs font-bold" style={{ textColor: money().wallet >= o.price ? INK : INK_SOFT }}>{formatCoins(o.price)}</Text>
                    </View>
                    <Pill label={E.tr("shop.buyIt")} tone={money().wallet >= o.price ? "leaf" : "cream"} width={48} height={24} small onTap={() => { setFocus(k()); buy(k()); }} />
                  </Tap>
                );
              }}
            </For>
          </View>
        </Show>
        <Show when={tab() === "sell"}>
          <SellTab focus={focus()} counter={counter()} onPick={(k) => { setFocus(k); toggle(k); }} onSell={sell} />
        </Show>
        <Show when={tab() === "savings"}>
          <View class="flex-col items-center gap-2" style={{ width: 320, height: 150 }}>
            <View class="flex-row gap-2">
              <Balance icon="coin" label={E.tr("shop.wallet")} coins={money().wallet} />
              <Balance icon="piggy" label={E.tr("shop.bank")} coins={money().bank} />
            </View>
            <View class="flex-row gap-1">
              <Index each={AMOUNTS}>
                {(n, k) => (
                  <Tap onTap={() => setAmount(k)} class="items-center justify-center rounded-lg" style={{ width: 70, height: 22, bgColor: amount() === k ? SUN : PAPER, borderWidth: amount() === k ? 0 : 1, borderColor: CREAM_2 }}>
                    <Text class="text-2xs font-bold" style={{ textColor: INK }}>{n() ? formatCoins(n()) : E.tr("shop.all")}</Text>
                  </Tap>
                )}
              </Index>
            </View>
            <View class="flex-row gap-2">
              <Pill icon="piggy" label={E.tr("shop.deposit")} tone="leaf" width={120} height={28} small onTap={deposit} />
              <Pill icon="coin" label={E.tr("shop.withdraw")} tone="paper" width={120} height={28} small onTap={withdraw} />
            </View>
            <Text class="text-2xs" style={{ textColor: INK_SOFT }}>{E.tr("shop.rate", { rate: shop.ratePercent() })}</Text>
          </View>
        </Show>
      </View>
    </Sheet>
  );
}

function Balance(props: { icon: string; label: string; coins: number }) {
  return (
    <View class="flex-row items-center gap-2 rounded-xl px-2" style={{ width: 148, height: 40, bgColor: PAPER }}>
      <Image src={picture(`ui:${props.icon}`)} style={{ width: 24, height: 24 }} />
      <View class="flex-col">
        <Text class="text-2xs font-bold" style={{ textColor: INK_SOFT }}>{props.label}</Text>
        <Text class="text-sm font-bold" style={{ textColor: INK }}>{formatCoins(props.coins)}</Text>
      </View>
    </View>
  );
}

/** The pockets to sell from, the chosen one's price, and the keys to sell it. */
function SellTab(props: { focus: number; counter: Sale[]; onPick: (k: number) => void; onSell: () => void }) {
  const pockets = () => O.slots().pockets;
  const chosen = () => pockets()[props.focus];
  const name = () => (chosen()?.item ? E.carriedNameOf(chosen()!.item) : "");
  const price = () => (chosen()?.item ? shop.price(chosen()!.item) : 0);
  const total = () => saleTotal(props.counter, pockets());
  const out = (k: number) => props.counter.some((c) => c.slot === k);
  const featured = O.featured;
  const width = COLUMNS * CELL + (COLUMNS - 1) * GAP;
  const rows = () => Math.ceil(pockets().length / COLUMNS);
  const row = () => Math.floor(props.focus / COLUMNS) * (CELL + GAP);
  return (
    <View class="flex-col items-center gap-1" style={{ width: 320, height: 174 }}>
      <Show when={featured()}>
        <Text class="text-2xs font-bold" style={{ textColor: SUN_DARK }}>{E.tr(`shop.featured.${featured() as "fish"}`)}</Text>
      </Show>
      <Scroll width={width} height={3 * CELL + 2 * GAP} content={rows() * (CELL + GAP)} focus={[row(), row() + CELL]}>
        <View class="flex-row flex-wrap" style={{ width, gap: GAP }}>
          <Index each={pockets()}>
            {(s, k) => (
              <Tap onTap={() => props.onPick(k)} class="relative items-center justify-center rounded-md shrink-0" style={{ width: CELL, height: CELL, bgColor: out(k) ? "#c9ecb6" : k === props.focus ? "#ffe9a6" : PAPER, borderWidth: k === props.focus ? 2 : 0, borderColor: SUN }}>
                <Show when={s().item}>
                  <Image src={carriedPicture(s().item)} style={{ width: 24, height: 24 }} />
                </Show>
                <Show when={s().count > 1}>
                  <View class="absolute" style={{ insetR: 1, insetB: 0 }}>
                    <Text class="text-2xs font-bold" style={{ textColor: INK }}>{String(s().count)}</Text>
                  </View>
                </Show>
              </Tap>
            )}
          </Index>
        </View>
      </Scroll>
      <View class="flex-row items-center justify-between px-2" style={{ width: 316, height: 26 }}>
        <View class="flex-col">
          <Text class="text-2xs font-bold" style={{ textColor: name() ? INK : INK_SOFT }}>
            {name() ? (chosen()!.count > 1 ? `${name()} ×${chosen()!.count}` : name()) : E.tr("shop.nothing")}
          </Text>
          <Show when={name()}>
            <Text class="text-2xs" style={{ textColor: price() ? INK_SOFT : tint(INK_SOFT, 0.8) }}>{price() ? E.tr("shop.each", { n: formatCoins(price()) }) : E.tr("shop.notBought")}</Text>
          </Show>
        </View>
        <Show when={total()}>
          <Pill label={E.tr("shop.basket", { n: formatCoins(total()) })} tone="leaf" width={130} height={26} small onTap={props.onSell} />
        </Show>
      </View>
    </View>
  );
}
