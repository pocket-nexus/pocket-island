// The shop at the stall in the browser, as on the console's touch screen (apps/island-3ds/shop.tsx),
// with three tabs:
//
//   Buy       the tools, and ten more pockets while there are more to sew on
//   Sell      the pockets, each with what it fetches today (the day's kind fetches half as much
//             again): what is clicked is set out on the counter, and sold together
//   Savings   the wallet and the savings, coins between them
//
// Mori says the rest (src/npc/mori.ts, in the speech box of src/ui/talk.ts): hello, what a thing
// costs before it is bought, what all that is set out fetches before it is paid for, and goodbye.
// The rules are the core's (src/core/things.ts shop); this only asks and shows.

import { h, svg } from "./dom.ts";
import { pocketName, t } from "../i18n/index.ts";
import { ITEM, shop, things } from "../core/things.ts";
import { formatCoins, itemDef } from "../items/items.ts";
import { moriSays, saleTotal, type Sale } from "../npc/mori.ts";
import { itemThumb } from "./thumbs.ts";

export type ShopTab = "buy" | "sell" | "savings";

export interface ShopHost {
  /** After a sale, a purchase or a deposit: keep the world. */
  keep(): void;
  /** Away, once Mori has said goodbye. */
  close(): void;
}

export interface ShopPanel {
  el: HTMLElement;
  /** Leaving: Mori says goodbye, and the shop goes. */
  leave(): void;
}

const QUICK = [100, 1000, 10_000];

export function shopPanel(host: ShopHost, first: ShopTab = "buy"): ShopPanel {
  let tab: ShopTab = first;
  let amount = 1000;
  // What is set out on the counter to sell: each pocket and how many of it.
  let counter: Sale[] = [];
  const el = h("div", { class: "modal panel shop", "data-shop": "" });
  moriSays.hello();

  const thumb = (id: number) => {
    const img = h("img", { alt: "", draggable: "false" });
    itemThumb(id, (url) => { img.src = url; });
    return img;
  };
  const coin = (n: number) => h("span", { class: "coins" }, svg("coin"), formatCoins(n));
  const changed = () => {
    host.keep();
    render();
  };

  function buyTab(): HTMLElement {
    const { wallet } = shop.money();
    const size = things.slots().pockets.length;
    return h("div", { class: "offers" }, ...shop.stock().map((o, k) => {
      const def = itemDef(o.item);
      const sub = o.item === ITEM.pocketUpgrade ? t("shop.upgrade", { from: size, to: size + 10 }) : "";
      return h("div", { class: "offer", "data-offer": String(o.item) },
        thumb(o.item),
        h("span", { class: "name" }, h("b", {}, def ? pocketName(def) : ""), sub ? h("small", {}, sub) : null),
        coin(o.price),
        h("button", { class: `pill small${wallet >= o.price ? " leaf" : ""}`, "data-do": "buy", onclick: () => moriSays.buy(k, changed) }, t("shop.buyIt")));
    }));
  }

  function sellTab(): HTMLElement {
    const s = things.slots();
    const cells = s.pockets.map((slot, k) => {
      const price = slot.item ? shop.price(slot.item) : 0;
      const out = counter.some((c) => c.slot === k);
      const cell = h("button", {
        class: `slot${out ? " on" : ""}${slot.item && !price ? " dim" : ""}`, "data-slot": String(k), onclick: () => {
          // On the counter, or back in the pockets.
          if (!slot.item || !price) return;
          counter = out ? counter.filter((c) => c.slot !== k) : [...counter, { slot: k, count: slot.count }];
          render();
        },
      });
      if (slot.item) {
        cell.append(thumb(slot.item));
        if (slot.count > 1) cell.append(h("b", {}, String(slot.count)));
      }
      return cell;
    });
    const total = saleTotal(counter, s.pockets);
    const featured = shop.featured();
    return h("div", { class: "sell" },
      featured ? h("p", { class: "featured" }, svg("sparkle"), t(`shop.featured.${featured}`)) : null,
      h("div", { class: "slots" }, ...cells),
      h("div", { class: "slot-detail" },
        total ? h("span", { class: "coins" }, svg("coin"), t("shop.basket", { n: formatCoins(total) })) : h("span", { class: "note" }, t("shop.nothing")),
        h("span", { class: "do" }, h("button", {
          class: "pill small leaf", "data-do": "sell", disabled: !total,
          onclick: () => moriSays.sell(counter, s.pockets, () => { counter = []; changed(); }),
        }, t("shop.sellThese")))));
  }

  function savingsTab(): HTMLElement {
    const m = shop.money();
    const input = h("input", { type: "number", min: "1", step: "1", value: String(amount), "data-amount": "", oninput: () => { amount = Math.max(0, Math.floor(Number(input.value) || 0)); } });
    return h("div", { class: "savings" },
      h("div", { class: "balances" },
        h("div", { class: "balance" }, svg("coin"), h("small", {}, t("shop.wallet")), h("b", { "data-wallet": "" }, formatCoins(m.wallet))),
        h("div", { class: "balance" }, svg("piggy"), h("small", {}, t("shop.bank")), h("b", { "data-bank": "" }, formatCoins(m.bank)))),
      h("div", { class: "amount" }, input,
        ...QUICK.map((n) => h("button", { class: "pill small", onclick: () => { amount = n; render(); } }, formatCoins(n)))),
      h("div", { class: "do" },
        h("button", { class: "pill small leaf", "data-do": "deposit", onclick: () => {
          const n = shop.deposit(amount || m.wallet);
          changed();
          moriSays.banked(n ? t("shop.deposited", { n: formatCoins(n) }) : t("shop.poor", { n: formatCoins(amount) }));
        } }, svg("piggy"), t("shop.deposit")),
        h("button", { class: "pill small", "data-do": "deposit-all", onclick: () => {
          const n = shop.deposit(shop.money().wallet);
          changed();
          if (n) moriSays.banked(t("shop.deposited", { n: formatCoins(n) }));
        } }, t("shop.all")),
        h("button", { class: "pill small", "data-do": "withdraw", onclick: () => {
          const n = shop.withdraw(amount);
          changed();
          if (n) moriSays.banked(t("shop.withdrew", { n: formatCoins(n) }));
        } }, svg("coin"), t("shop.withdraw"))),
      h("p", { class: "note" }, t("shop.rate")));
  }

  function render(): void {
    const tabs = (["buy", "sell", "savings"] as const).map((k) =>
      h("button", { class: k === tab ? "on" : "", "data-tab": k, onclick: () => { tab = k; counter = []; render(); } }, t(`shop.${k}`)));
    el.replaceChildren(
      h("div", { class: "shop-head" }, svg("stall"), h("h2", {}, t("shop.title")), coin(shop.money().wallet)),
      h("div", { class: "seg shop-tabs" }, ...tabs),
      tab === "buy" ? buyTab() : tab === "sell" ? sellTab() : savingsTab(),
      h("div", { class: "foot" }, h("button", { class: "pill", "data-do": "bye", onclick: () => leave() }, t("shop.bye"))));
  }

  const leave = () => moriSays.bye(() => host.close());
  render();
  return { el, leave };
}
