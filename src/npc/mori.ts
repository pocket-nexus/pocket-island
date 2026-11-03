// Mori, who keeps the stall: what they say at the shop, shared by the browser (src/ui/shop.ts) and
// the console (apps/island-3ds/shop.tsx). As every person on the island (./talk.ts), Mori asks
// before coins change hands, buying (what it is, what it comes to) and selling (what all of it
// fetches), and says goodbye. The shop's rules are the core's (src/core/things.ts shop).

import { formatCoins, itemDef } from "../items/items.ts";
import { pocketName, t, type MessageKey } from "../i18n/index.ts";
import { ITEM, shop } from "../core/things.ts";
import { talk, type Answer } from "./talk.ts";
import { sound } from "../audio/hear.ts";

export const MORI_COLOR = "#b07a4f";

type Tr = (key: MessageKey, params?: Record<string, string | number>) => string;

/** What Mori says, a line or a question, in their voice (a little low). */
function mori(tr: Tr, text: string, answers?: Answer[]) {
  return { speaker: tr("shop.keeper"), color: MORI_COLOR, voice: 0.85, text, answers };
}

/** A pocket's worth going to the shop: which pocket, and how many of it. */
export interface Sale {
  slot: number;
  count: number;
}

/** What `sales` fetch together today. */
export function saleTotal(sales: Sale[], pockets: { item: number }[]): number {
  return sales.reduce((n, s) => n + shop.price(pockets[s.slot]?.item ?? 0) * s.count, 0);
}

export const moriSays = {
  /** Coming to the counter: a greeting, and the interest savings earned since. */
  hello(tr: Tr = t): void {
    const { interest } = shop.money();
    talk.say([mori(tr, tr("shop.hello")), ...(interest > 0 ? [mori(tr, tr("shop.interest", { n: formatCoins(interest) }))] : [])]);
  },

  /** The stock's `k`th offer: what it is and what it costs, asked; bought on yes. */
  buy(k: number, done: () => void, tr: Tr = t): void {
    const o = shop.stock()[k];
    const def = o && itemDef(o.item);
    if (!o || !def) return;
    const name = pocketName(def);
    talk.say([mori(tr, tr(o.item === ITEM.pocketUpgrade ? "shop.askMore" : "shop.ask", { name, n: formatCoins(o.price) }), [
      {
        label: tr("shop.yesBuy"), then: () => {
          const res = shop.buy(k);
          if (res === "ok") sound("coin", 0.8);
          done();
          talk.say([mori(tr, res === "ok" ? tr(o.item === ITEM.pocketUpgrade ? "shop.more" : "shop.thanks")
            : res === "poor" ? tr("shop.poor", { n: formatCoins(o.price - shop.money().wallet) })
            : tr("shop.full"))]);
        },
      },
      { label: tr("shop.no"), then: () => talk.say([mori(tr, tr("shop.later"))]) },
    ])]);
  },

  /** What is set out to sell: what it all fetches, asked; paid on yes. */
  sell(sales: Sale[], pockets: { item: number }[], done: (paid: number) => void, tr: Tr = t): void {
    const total = saleTotal(sales, pockets);
    if (!total) {
      talk.say([mori(tr, tr("shop.nothing"))]);
      return;
    }
    talk.say([mori(tr, tr("shop.offer", { n: formatCoins(total) }), [
      {
        label: tr("shop.yesSell"), then: () => {
          let paid = 0;
          for (const s of sales) paid += shop.sell(s.slot, s.count);
          if (paid) sound("coin", 0.8);
          done(paid);
          talk.say([mori(tr, paid ? tr("shop.sold", { n: formatCoins(paid) }) : tr("shop.notBought"))]);
        },
      },
      { label: tr("shop.no"), then: () => talk.say([mori(tr, tr("shop.later"))]) },
    ])]);
  },

  /** Coins into savings or out of them: said. */
  banked(line: string, tr: Tr = t): void {
    talk.say([mori(tr, line)]);
  },

  /** Leaving: goodbye, and then `close`. */
  bye(close: () => void, tr: Tr = t): void {
    talk.close();
    talk.say([mori(tr, tr("shop.goodbye"))], close);
  },
};
