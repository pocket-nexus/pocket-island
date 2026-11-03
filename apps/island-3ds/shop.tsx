// The shop at the stall on the touch screen, as in the browser (src/ui/shop.ts): Mori behind the
// counter says how it went, over three tabs:
//
//   Buy       the tools, and ten more pockets while there are more to sew on
//   Sell      the pockets, the chosen one's price today (the day's kind fetches half as much again)
//   Savings   the wallet and the savings, coins between them, and the interest the day paid
//
// The pad: L and R change tab; in Buy up and down choose and A buys; in Sell the +Control Pad
// chooses, A sells one and Y all of them; in Savings left and right choose how much, A deposits and
// Y withdraws. B goes back to the island. The rules are the core's (src/core/things.ts shop).
import { createSignal, For, Index, onCleanup, Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { ITEM, shop, type Offer } from "../../src/core/things.ts";
import { formatCoins, itemDef } from "../../src/items/items.ts";
import { picture } from "./catalog.ts";
import * as E from "./editor.ts";
import * as O from "./outdoors.ts";
import { Pill, Scroll, Sheet, TabStrip, Tap } from "./parts.tsx";
import { CREAM_2, INK, INK_SOFT, PAPER, SUN, SUN_DARK, tint } from "./theme.ts";

type ShopTab = "buy" | "sell" | "savings";
const TABS: ShopTab[] = ["buy", "sell", "savings"];
const AMOUNTS = [100, 1000, 10_000, 0] as const;
const CELL = 30, GAP = 3, COLUMNS = 9;

/** The shop's answer to the pad while it is open (sheets.tsx sheetPress asks it first). */
export let shopPad: ((pressed: number) => boolean) | null = null;

export function ShopSheet() {
  const [tab, setTab] = createSignal<ShopTab>("buy");
  const [focus, setFocus] = createSignal(0);
  const [amount, setAmount] = createSignal(1);
  // What changed is read again: the coins, the stock, the pockets.
  const [money, setMoney] = createSignal(shop.money());
  const [stock, setStock] = createSignal<Offer[]>(shop.stock());
  const first = money().interest > 0 ? E.tr("shop.interest", { n: formatCoins(money().interest) }) : E.tr("shop.hello");
  const [say, setSay] = createSignal(first);
  O.refreshSlots();
  const pockets = () => O.slots().pockets;
  const did = (line: string) => {
    setSay(line);
    setMoney(shop.money());
    setStock(shop.stock());
    O.refreshSlots();
    O.keepNow();
  };
  const switchTab = (t: ShopTab) => {
    setTab(t);
    setFocus(0);
  };

  const buy = (k: number) => {
    const o = stock()[k];
    if (!o) return;
    const res = shop.buy(k);
    did(res === "ok" ? E.tr(o.item === ITEM.pocketUpgrade ? "shop.more" : "shop.thanks")
      : res === "poor" ? E.tr("shop.poor", { n: formatCoins(o.price - shop.money().wallet) })
      : res === "full" ? E.tr("shop.full") : say());
  };
  const sell = (k: number, all: boolean) => {
    const s = pockets()[k];
    if (!s?.item) return;
    const paid = shop.sell(k, all ? s.count : 1);
    did(paid ? E.tr("shop.sold", { n: formatCoins(paid) }) : E.tr("shop.notBought"));
  };
  const coinsChosen = () => AMOUNTS[amount()] || money().wallet;
  const deposit = () => {
    const n = shop.deposit(coinsChosen());
    did(n ? E.tr("shop.deposited", { n: formatCoins(n) }) : E.tr("shop.poor", { n: formatCoins(coinsChosen()) }));
  };
  const withdraw = () => {
    const n = shop.withdraw(AMOUNTS[amount()] || money().bank);
    if (n) did(E.tr("shop.withdrew", { n: formatCoins(n) }));
  };

  onCleanup(() => {
    shopPad = null;
  });
  shopPad = (pressed) => {
    if (pressed & (BTN.LTRIGGER | BTN.RTRIGGER)) {
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
      else if (pressed & BTN.CIRCLE) sell(focus(), false);
      else if (pressed & BTN.SQUARE) sell(focus(), true);
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
    <Sheet title={E.tr("shop.title")} onClose={() => E.openSheet(null)} right={wallet}>
      {/* What Mori says. */}
      <View class="absolute flex-row items-center gap-2 rounded-xl px-2" style={{ insetL: 6, insetT: 4, width: 308, height: 24, bgColor: PAPER }}>
        <Image src={picture("ui:stall")} style={{ width: 16, height: 16 }} />
        <Text class="text-2xs font-bold" style={{ textColor: INK }}>{say()}</Text>
      </View>
      <View class="absolute" style={{ insetL: 6, insetT: 32 }}>
        <TabStrip items={TABS.map((t) => ({ value: t, label: E.tr(`shop.${t}`) }))} value={tab()} width={308} onPick={switchTab} />
      </View>
      <View class="absolute" style={{ insetL: 0, insetT: 60, width: 320, height: 150 }}>
        <Show when={tab() === "buy"}>
          <View class="flex-col items-center gap-1" style={{ width: 320, height: 150 }}>
            <For each={stock()}>
              {(o, k) => {
                const def = itemDef(o.item);
                const sub = () => (o.item === ITEM.pocketUpgrade ? E.tr("shop.upgrade", { from: pockets().length, to: pockets().length + 10 }) : "");
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
          <SellTab focus={focus()} onPick={setFocus} onSell={sell} />
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
            <Text class="text-2xs" style={{ textColor: INK_SOFT }}>{E.tr("shop.rate")}</Text>
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
function SellTab(props: { focus: number; onPick: (k: number) => void; onSell: (k: number, all: boolean) => void }) {
  const pockets = () => O.slots().pockets;
  const chosen = () => pockets()[props.focus];
  const def = () => (chosen()?.item ? itemDef(chosen()!.item) : undefined);
  const price = () => (def() ? shop.price(def()!.id) : 0);
  const featured = shop.featured();
  const width = COLUMNS * CELL + (COLUMNS - 1) * GAP;
  const rows = () => Math.ceil(pockets().length / COLUMNS);
  const row = () => Math.floor(props.focus / COLUMNS) * (CELL + GAP);
  return (
    <View class="flex-col items-center gap-1" style={{ width: 320, height: 150 }}>
      <Show when={featured}>
        <Text class="text-2xs font-bold" style={{ textColor: SUN_DARK }}>{E.tr(`shop.featured.${featured as "fish"}`)}</Text>
      </Show>
      <Scroll width={width} height={3 * CELL + 2 * GAP} content={rows() * (CELL + GAP)} focus={[row(), row() + CELL]}>
        <View class="flex-row flex-wrap" style={{ width, gap: GAP }}>
          <Index each={pockets()}>
            {(s, k) => (
              <Tap onTap={() => props.onPick(k)} class="relative items-center justify-center rounded-md shrink-0" style={{ width: CELL, height: CELL, bgColor: k === props.focus ? "#ffe9a6" : PAPER, borderWidth: k === props.focus ? 2 : 0, borderColor: SUN }}>
                <Show when={s().item}>
                  <Image src={picture(`item:${s().item}`)} style={{ width: 24, height: 24 }} />
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
          <Text class="text-2xs font-bold" style={{ textColor: def() ? INK : INK_SOFT }}>
            {def() ? (chosen()!.count > 1 ? `${E.pocketNameOf(def()!)} ×${chosen()!.count}` : E.pocketNameOf(def()!)) : E.tr("shop.nothing")}
          </Text>
          <Show when={def()}>
            <Text class="text-2xs" style={{ textColor: price() ? INK_SOFT : tint(INK_SOFT, 0.8) }}>{price() ? E.tr("shop.each", { n: formatCoins(price()) }) : E.tr("shop.notBought")}</Text>
          </Show>
        </View>
        <Show when={def() && price()}>
          <View class="flex-row gap-1">
            <Pill label={E.tr("shop.sellOne")} tone="cream" width={64} height={24} small onTap={() => props.onSell(props.focus, false)} />
            <Show when={chosen()!.count > 1}>
              <Pill label={E.tr("shop.sellAll")} tone="leaf" width={70} height={24} small onTap={() => props.onSell(props.focus, true)} />
            </Show>
          </View>
        </Show>
      </View>
    </View>
  );
}
