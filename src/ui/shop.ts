// The shop at the stall in the browser, as on the console's touch screen (apps/island-3ds/shop.tsx):
// Mori behind the counter says how it went, over three tabs:
//
//   Buy       the tools, and ten more pockets while there are more to sew on
//   Sell      the pockets, each with what it fetches today (the day's kind fetches half as much again)
//   Savings   the wallet and the savings, coins between them, and the interest the day paid
//
// The rules are the core's (src/core/things.ts shop); this only asks and shows.

import { h, svg } from "./dom.ts";
import { pocketName, t } from "../i18n/index.ts";
import { ITEM, shop, things, type Slot } from "../core/things.ts";
import { formatCoins, itemDef } from "../items/items.ts";
import { itemThumb } from "./thumbs.ts";

export type ShopTab = "buy" | "sell" | "savings";

export interface ShopHost {
  /** After a sale, a purchase or a deposit: keep the world. */
  keep(): void;
  close(): void;
}

const QUICK = [100, 1000, 10_000];

export function shopPanel(host: ShopHost, first: ShopTab = "buy"): HTMLElement {
  let tab: ShopTab = first;
  let chosen = -1;
  let amount = 1000;
  let say = t("shop.hello");
  const money = shop.money();
  if (money.interest > 0) say = t("shop.interest", { n: formatCoins(money.interest) });
  const el = h("div", { class: "modal panel shop", "data-shop": "" });

  const thumb = (id: number) => {
    const img = h("img", { alt: "", draggable: "false" });
    itemThumb(id, (url) => { img.src = url; });
    return img;
  };
  const coin = (n: number) => h("span", { class: "coins" }, svg("coin"), formatCoins(n));
  const did = (line: string) => {
    say = line;
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
        h("button", {
          class: "pill small leaf", "data-do": "buy", disabled: wallet < o.price, onclick: () => {
            const res = shop.buy(k);
            did(res === "ok" ? t(o.item === ITEM.pocketUpgrade ? "shop.more" : "shop.thanks")
              : res === "poor" ? t("shop.poor", { n: formatCoins(o.price - shop.money().wallet) })
              : res === "full" ? t("shop.full") : "");
          },
        }, t("shop.buyIt")));
    }));
  }

  function sellTab(): HTMLElement {
    const s = things.slots();
    const cells = s.pockets.map((slot, k) => {
      const price = slot.item ? shop.price(slot.item) : 0;
      const cell = h("button", { class: `slot${k === chosen ? " on" : ""}${slot.item && !price ? " dim" : ""}`, "data-slot": String(k), onclick: () => { chosen = chosen === k ? -1 : k; render(); } });
      if (slot.item) {
        cell.append(thumb(slot.item));
        if (slot.count > 1) cell.append(h("b", {}, String(slot.count)));
      }
      return cell;
    });
    const pick: Slot | undefined = s.pockets[chosen];
    const def = pick?.item ? itemDef(pick.item) : undefined;
    const price = def ? shop.price(def.id) : 0;
    const sell = (n: number) => {
      const paid = shop.sell(chosen, n);
      if (!things.slots().pockets[chosen]?.item) chosen = -1;
      did(paid ? t("shop.sold", { n: formatCoins(paid) }) : t("shop.notBought"));
    };
    const featured = shop.featured();
    return h("div", { class: "sell" },
      featured ? h("p", { class: "featured" }, svg("sparkle"), t(`shop.featured.${featured}`)) : null,
      h("div", { class: "slots" }, ...cells),
      h("div", { class: "slot-detail" }, ...(def && pick
        ? [h("b", {}, pick.count > 1 ? `${pocketName(def)} ×${pick.count}` : pocketName(def)),
          price ? h("span", { class: "note" }, t("shop.each", { n: formatCoins(price) })) : h("span", { class: "note" }, t("shop.notBought")),
          h("span", { class: "do" },
            h("button", { class: "pill small", "data-do": "sell-one", disabled: !price, onclick: () => sell(1) }, t("shop.sellOne")),
            pick.count > 1 ? h("button", { class: "pill small leaf", "data-do": "sell-all", disabled: !price, onclick: () => sell(pick.count) }, t("shop.sellAll")) : null)]
        : [h("span", { class: "note" }, t("shop.nothing"))])));
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
          did(n ? t("shop.deposited", { n: formatCoins(n) }) : t("shop.poor", { n: formatCoins(amount) }));
        } }, svg("piggy"), t("shop.deposit")),
        h("button", { class: "pill small", "data-do": "deposit-all", onclick: () => {
          const n = shop.deposit(shop.money().wallet);
          if (n) did(t("shop.deposited", { n: formatCoins(n) }));
        } }, t("shop.all")),
        h("button", { class: "pill small", "data-do": "withdraw", onclick: () => {
          const n = shop.withdraw(amount);
          if (n) did(t("shop.withdrew", { n: formatCoins(n) }));
        } }, svg("coin"), t("shop.withdraw"))),
      h("p", { class: "note" }, t("shop.rate")));
  }

  function render(): void {
    const tabs = (["buy", "sell", "savings"] as const).map((k) =>
      h("button", { class: k === tab ? "on" : "", "data-tab": k, onclick: () => { tab = k; chosen = -1; render(); } }, t(`shop.${k}`)));
    el.replaceChildren(
      h("div", { class: "shop-head" }, svg("stall"), h("h2", {}, t("shop.title")), coin(shop.money().wallet)),
      h("p", { class: "shop-say", "data-say": "" }, say),
      h("div", { class: "seg shop-tabs" }, ...tabs),
      tab === "buy" ? buyTab() : tab === "sell" ? sellTab() : savingsTab(),
      h("div", { class: "foot" }, h("button", { class: "pill", "data-do": "bye", onclick: () => host.close() }, t("shop.bye"))));
  }

  render();
  return el;
}
