// Soft shadows that harden where an object touches down (PCSS).
//
// three.js's PCF filter takes five taps at a fixed radius. The key light here
// stands for a broad soft source, so its shadows should widen with the gap
// between caster and receiver: crisp under a chair leg, soft under a hanging
// lamp. The basic shadow map gives the shader raw depth; this replaces its
// lookup with a blocker search and a 32-tap filter whose width follows the
// blocker's distance. `shadow.radius` carries the light's softness: the
// width in shadow-map UV of the penumbra per unit of normalised depth.

import * as THREE from "three";

const SOFT_SHADOW = /* glsl */ `
		float pcssNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}

		vec2 pcssDisk( int i, int count, float phi ) {
			float r = sqrt( ( float( i ) + 0.5 ) / float( count ) );
			float theta = float( i ) * 2.399963229728653 + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}

		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			// Receiver plane: how the receiver's own depth changes across the
			// map, so a wide kernel compares each tap against the surface's
			// depth at that tap and a tilted floor does not shadow itself.
			vec3 ddx = dFdx( shadowCoord.xyz );
			vec3 ddy = dFdy( shadowCoord.xyz );
			float det = ddx.x * ddy.y - ddx.y * ddy.x;
			vec2 slope = abs( det ) > 1e-12 ? vec2( ddy.y * ddx.z - ddx.y * ddy.z, ddx.x * ddy.z - ddy.x * ddx.z ) / det : vec2( 0.0 );
			slope = clamp( slope, vec2( -0.5 ), vec2( 0.5 ) );
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			if ( inFrustum && shadowCoord.z <= 1.0 ) {
				vec2 texel = vec2( 1.0 ) / shadowMapSize;
				float margin = texel.x * 2.0 * ( abs( slope.x ) + abs( slope.y ) ) + 0.0004;
				float phi = pcssNoise( gl_FragCoord.xy ) * PI2;
				float search = shadowRadius * 0.08 + texel.x * 3.0;
				float blockers = 0.0;
				float depthSum = 0.0;
				for ( int i = 0; i < 16; i ++ ) {
					vec2 off = pcssDisk( i, 16, phi ) * search;
					float d = texture2D( shadowMap, shadowCoord.xy + off ).r;
					float zr = shadowCoord.z + dot( slope, off );
					if ( d < zr - margin ) { depthSum += zr - d; blockers += 1.0; }
				}
				if ( blockers > 0.0 ) {
					float gap = depthSum / blockers;
					float penumbra = clamp( gap * shadowRadius, 0.0, search ) + texel.x * 1.5;
					float lit = 0.0;
					for ( int i = 0; i < 56; i ++ ) {
						vec2 off = pcssDisk( i, 56, phi + 1.7 ) * penumbra;
						float d = texture2D( shadowMap, shadowCoord.xy + off ).r;
						float zr = shadowCoord.z + dot( slope, off );
						lit += step( zr - margin, d );
					}
					shadow = lit / 56.0;
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
`;

let installed = false;

export function installSoftShadows(): void {
  if (installed) return;
  // The basic lookup is the second sampler2D getShadow after the VSM branch
  // opens (the first is VSM's own). Built three.js strips the comments, so
  // the code is found by its shape.
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const sig = "float getShadow( sampler2D shadowMap";
  const vsm = chunk.indexOf("defined( SHADOWMAP_TYPE_VSM )");
  const first = chunk.indexOf(sig, vsm);
  const start = first < 0 ? -1 : chunk.indexOf(sig, first + sig.length);
  const ret = start < 0 ? -1 : chunk.indexOf("return mix( 1.0, shadow, shadowIntensity );", start);
  const close = ret < 0 ? -1 : chunk.indexOf("}", ret);
  if (vsm < 0 || start < 0 || close < 0) {
    console.warn("soft shadows: three.js shadow chunk has changed; keeping the default filter");
    return;
  }
  (THREE.ShaderChunk as Record<string, string>).shadowmap_pars_fragment =
    chunk.slice(0, start) + SOFT_SHADOW + chunk.slice(close + 1);
  installed = true;
}
