// The touch screen outdoors: the island's map, as the browser draws it
// (src/island/map.ts, through the export), four pixels a tile across the
// whole screen, with where the player is. A tap walks there; a tap on the
// house walks to its door and goes in. Small keys in the sea's corners:
// the time of day, home, the menu.
import { Image, Text, View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { picture } from "./catalog.ts";
import * as E from "./editor.ts";
import * as O from "./outdoors.ts";
import { Pill } from "./parts.tsx";
import { CORAL, INK, PAPER, tint } from "./theme.ts";

const W = 320, H = 240;
/** Pixels a tile, and where the map's top-left corner is. */
const S = 4;
const X0 = (W - O.map.w * S) / 2, Y0 = (H - O.map.d * S) / 2;
/** The picture is 512 pixels at 7 a tile. */
const PICTURE = (512 * S) / 7;

const TIME_ICONS = ["sun", "sunset", "moon"];

export function IslandMap() {
  createGesture({
    surface: "auxiliary",
    region: { rect: () => (E.sheet() || E.confirmation() ? null : { x: 0, y: 0, w: W, h: H }) },
    onTap: (c) => {
      const x = (c.x - X0) / S, z = (c.y - Y0) / S;
      const [x0, z0, x1, z1] = O.map.house.rect;
      if (x > x0 - 0.5 && x < x1 + 0.5 && z > z0 - 1 && z < z1 + 0.6) O.goHome();
      else O.walkTo(x, z);
    },
  });
  const m = () => O.marker();
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: W, height: H, bgColor: "#5cb8d6" }}>
      <Image src={picture("island:map")} class="absolute" style={{ insetL: X0, insetT: Y0, width: PICTURE, height: PICTURE }} />
      {/* The player: a dot with a nose toward where they face. */}
      <View class="absolute rounded-full w-3 h-3" style={{ insetL: X0 + m().x * S - 6, insetT: Y0 + m().z * S - 6, bgColor: "#ffffff" }} />
      <View class="absolute rounded-full w-2 h-2" style={{ insetL: X0 + m().x * S - 4, insetT: Y0 + m().z * S - 4, bgColor: CORAL }} />
      <View class="absolute rounded-full w-1 h-1" style={{ insetL: X0 + (m().x + Math.sin(m().yaw) * 1.1) * S - 2, insetT: Y0 + (m().z + Math.cos(m().yaw) * 1.1) * S - 2, bgColor: CORAL }} />
      <View class="absolute flex-row items-center gap-1 rounded-xl px-2" style={{ insetL: 4, insetT: 4, height: 22, bgColor: tint(PAPER, 0.94) }}>
        <Image src={picture(`ui:${TIME_ICONS[E.timeOfDay()]}`)} style={{ width: 14, height: 14 }} />
        <Text class="text-2xs font-bold" style={{ textColor: INK }}>{E.timeName()}</Text>
      </View>
      <View class="absolute" style={{ insetR: 4, insetT: 4 }}>
        <Pill icon="house" width={30} height={26} small onTap={() => E.openSheet("menu")} />
      </View>
      <View class="absolute" style={{ insetR: 4, insetB: 4 }}>
        <Pill icon="door" label={E.tr("island.goIn")} tone="leaf" width={96} height={26} small onTap={O.goHome} />
      </View>
      <View class="absolute" style={{ insetL: 4, insetB: 4 }}>
        <Pill icon={TIME_ICONS[(E.timeOfDay() + 1) % 3]!} width={30} height={26} small onTap={() => E.setTime((E.timeOfDay() + 1) % 3)} />
      </View>
    </View>
  );
}
