// What the island's people say, on the console as in the browser (src/ui/talk.ts), as on the
// handheld island games: the speech box on the upper screen, the speaker's name on it, the line
// coming a few letters at a time, a question's answers stacked above it. A shows the rest of a line
// and then the next, or takes the lit answer; up and down move among answers; B is the last answer.
// On the touch screen a tap does what A does, and a question's answers are keys to tap
// (src/npc/talk.ts).
import { createSignal, For, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { talk } from "../../src/npc/talk.ts";
import { Pill, SLOT, Tap, wrap } from "./parts.tsx";
import { INK, PAPER, SUN, SUN_DARK, tint } from "./theme.ts";

const [state, setState] = createSignal(talk.now);
talk.watch(setState);

/** Each frame: the line comes on. */
export function talkFrame(): void {
  talk.tick(1 / 60);
}

/** A button's down edge while someone is talking; true when it was theirs. */
export function talkPress(pressed: number): boolean {
  if (!talk.open) return false;
  if (pressed & BTN.CIRCLE) talk.press();
  else if (pressed & BTN.CROSS) talk.back();
  else if (pressed & BTN.UP) talk.move(-1);
  else if (pressed & BTN.DOWN) talk.move(1);
  return true;
}

export const talking = () => !!state().line;

const BOX_W = 360, TEXT_W = 328;

/** The upper screen's speech box, and a question's answers above it. */
export function TalkBox() {
  // The whole line in lines as wide as the box, and as much of each as has come.
  const lines = () => {
    const s = state();
    if (!s.line) return [];
    const all = wrap(s.line.text, SLOT.smallBold, TEXT_W, 3);
    let left = Math.floor(s.shown);
    return all.map((l) => {
      const part = l.slice(0, Math.max(0, left));
      left -= l.length;
      return part;
    });
  };
  const done = () => !!state().line && state().shown >= state().line!.text.length;
  const answers = () => (done() ? state().line!.answers ?? [] : []);
  return (
    <Show when={state().line}>
      <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 240 }}>
        <Show when={answers().length}>
          <View class="absolute flex-col gap-1" style={{ insetR: 20, insetB: 92 }}>
            <For each={answers()}>
              {(a, k) => (
                <View class="rounded-xl px-3 justify-center" style={{ height: 22, bgColor: k() === state().answer ? SUN : PAPER, borderWidth: 2, borderColor: k() === state().answer ? SUN_DARK : tint(INK, 0.25) }}>
                  <Text class="text-xs font-bold" style={{ textColor: INK }}>{a.label}</Text>
                </View>
              )}
            </For>
          </View>
        </Show>
        <View class="absolute flex-col px-4 py-2" style={{ insetL: (400 - BOX_W) / 2, insetB: 8, width: BOX_W, height: 74, radius: 18, bgColor: PAPER }}>
          <For each={lines()}>{(l) => <Text class="text-xs font-bold" style={{ textColor: INK, height: 18, marginT: 2 }}>{l}</Text>}</For>
        </View>
        <View class="absolute rounded-xl px-3 justify-center" style={{ insetL: (400 - BOX_W) / 2 + 14, insetB: 74, height: 20, bgColor: state().line!.color }}>
          <Text class="text-xs font-bold" style={{ textColor: "#ffffff" }}>{state().line!.speaker}</Text>
        </View>
        <Show when={done() && !answers().length}>
          <View class="absolute" style={{ insetR: (400 - BOX_W) / 2 + 14, insetB: 14, width: 10, height: 6, bgColor: SUN_DARK }} />
        </Show>
      </View>
    </Show>
  );
}

/** The touch screen while someone talks: a tap goes on, and a question's answers are keys. */
export function TalkTouch() {
  const done = () => !!state().line && state().shown >= state().line!.text.length;
  const answers = () => (done() ? state().line!.answers ?? [] : []);
  return (
    <Show when={state().line}>
      <Show
        when={answers().length}
        fallback={<Tap onTap={() => talk.press()} class="absolute" style={{ insetL: 0, insetT: 0, width: 320, height: 240, bgColor: tint("#3a2a1a", 0.35) }} />}
      >
        <View class="absolute flex-col items-center justify-center gap-2" style={{ insetL: 0, insetT: 0, width: 320, height: 240, bgColor: tint("#3a2a1a", 0.35) }}>
          <For each={answers()}>
            {(a, k) => <Pill label={a.label} tone={k() === state().answer ? "sun" : "paper"} width={200} height={34} onTap={() => talk.choose(k())} />}
          </For>
        </View>
      </Show>
    </Show>
  );
}
