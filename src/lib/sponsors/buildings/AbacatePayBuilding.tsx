"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SponsorBuildingProps } from "../registry";

// ─── Building dimensions: L-shaped HQ ───────────────────
// Main slab (wide, shorter)
const MW = 130, MD = 60, MH = 300;
// Side tower (narrow, taller)
const TW = 50, TD = 55, TH = 440;
const T_OFF = MW / 2 + TW / 2 - 10; // overlap slightly
// Skybridge
const BRIDGE_Y = 180, BRIDGE_H = 18;

// ─── Pixel font ─────────────────────────────────────────
const PF: Record<string, number[][]> = {
  A: [[0,1,0],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  B: [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,1,0]],
  C: [[0,1,1],[1,0,0],[1,0,0],[1,0,0],[0,1,1]],
  T: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
  E: [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
};

function makeBitmap(word: string): number[][] {
  const letters = word.split("").map(ch => PF[ch]);
  const h = letters[0].length;
  let w = 0;
  for (let i = 0; i < letters.length; i++) { w += letters[i][0].length; if (i < letters.length - 1) w++; }
  const bm = Array.from({ length: h }, () => Array(w).fill(0));
  let col = 0;
  for (const L of letters) {
    for (let r = 0; r < h; r++) for (let c = 0; c < L[0].length; c++) bm[r][col + c] = L[r][c];
    col += L[0].length + 1;
  }
  return bm;
}

const TEXT_BM = makeBitmap("ABACATE");
const TXT_W = TEXT_BM[0].length;
const MIN_COLS = TXT_W + 4;

// ─── Glass texture ──────────────────────────────────────
function createGlassTex(
  cols: number, rows: number, seed: number,
  litColors: string[], offColor: string, faceColor: string,
  accentColor?: string, textBM?: number[][], txCol?: number, txRow?: number,
): THREE.CanvasTexture {
  const cW = 16, cH = 16;
  const w = cols * cW, h = rows * cH;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const shellC = new THREE.Color(faceColor);
  shellC.multiplyScalar(1.8);
  const gridColor = "#" + shellC.getHexString();

  ctx.fillStyle = faceColor;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * cH); ctx.lineTo(w, r * cH); ctx.stroke(); }
  for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * cW, 0); ctx.lineTo(c * cW, h); ctx.stroke(); }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hash = ((r * 13 + c * 23 + seed) * 2654435761) >>> 0;

      let isText = false;
      let nearText = false;
      if (textBM && txCol != null && txRow != null) {
        const tr = r - txRow, tc = c - txCol;
        if (tr >= 0 && tr < textBM.length && tc >= 0 && tc < textBM[0].length && textBM[tr][tc])
          isText = true;
        if (!isText && tr >= -2 && tr <= textBM.length + 1 && tc >= -1 && tc <= textBM[0].length)
          nearText = true;
      }

      if (isText && accentColor) {
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = 1;
        ctx.fillRect(c * cW + 1, r * cH + 1, cW - 2, cH - 2);
        ctx.globalAlpha = 0.25;
        ctx.fillRect(c * cW - 1, r * cH - 1, cW + 2, cH + 2);
        ctx.globalAlpha = 1;
        continue;
      } else if (nearText) {
        ctx.fillStyle = offColor;
        ctx.globalAlpha = 0.25;
      } else {
        const lit = (hash % 100) < 45;
        if (lit) {
          ctx.fillStyle = litColors[hash % litColors.length];
          ctx.globalAlpha = 0.45 + (hash % 20) / 100;
        } else {
          ctx.fillStyle = offColor;
          ctx.globalAlpha = 0.55;
        }
      }
      ctx.fillRect(c * cW + 2, r * cH + 2, cW - 4, cH - 4);
      ctx.globalAlpha = 1;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ─── Avocado logo ───────────────────────────────────────
function createAvocadoLogo(accent: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 2.5, toneMapped: false,
  });

  const ovalPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ovalPts.push(new THREE.Vector3(Math.cos(a) * 16, 0, Math.sin(a) * 12));
  }
  const ovalPath = new THREE.CatmullRomCurve3(ovalPts, true, "catmullrom", 0.01);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(ovalPath, 64, 2.2, 8, true), mat));

  g.add(new THREE.Mesh(new THREE.SphereGeometry(5, 12, 12), mat));

  return g;
}

// ─── Helpers ────────────────────────────────────────────
function CornerStrips({ w, d, h, yC, accent }: { w: number; d: number; h: number; yC: number; accent: string }) {
  const hw = w / 2, hd = d / 2;
  return (
    <>
      {[[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]].map(([cx, cz], i) => (
        <mesh key={i} position={[cx, yC, cz]}>
          <boxGeometry args={[0.6, h, 0.6]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function GlassFacade({ tex, w, h, pos, rotY, emColor }: { tex: THREE.Texture; w: number; h: number; pos: [number, number, number]; rotY: number; emColor: string }) {
  return (
    <mesh position={pos} rotation={[0, rotY, 0]}>
      <planeGeometry args={[w - 4, h - 4]} />
      <meshStandardMaterial map={tex} emissive={emColor} emissiveMap={tex} emissiveIntensity={0.7} toneMapped={false} transparent />
    </mesh>
  );
}

function BoxSection({ w, h, d, y, shellMat, glassFront, glassSide, emColor, accent }: {
  w: number; h: number; d: number; y: number;
  shellMat: THREE.Material; glassFront: THREE.Texture; glassSide: THREE.Texture;
  emColor: string; accent: string;
}) {
  return (
    <group>
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[w, h, d]} />
        <primitive object={shellMat} attach="material" />
      </mesh>
      <GlassFacade tex={glassFront} w={w} h={h} pos={[0, y, d / 2 + 0.3]} rotY={0} emColor={emColor} />
      <GlassFacade tex={glassFront} w={w} h={h} pos={[0, y, -d / 2 - 0.3]} rotY={Math.PI} emColor={emColor} />
      <GlassFacade tex={glassSide} w={d} h={h} pos={[w / 2 + 0.3, y, 0]} rotY={Math.PI / 2} emColor={emColor} />
      <GlassFacade tex={glassSide} w={d} h={h} pos={[-w / 2 - 0.3, y, 0]} rotY={-Math.PI / 2} emColor={emColor} />
      <CornerStrips w={w} d={d} h={h} yC={y} accent={accent} />
    </group>
  );
}

// ─── Component ──────────────────────────────────────────

export default function AbacatePayBuilding({
  themeAccent,
  themeWindowLit,
  themeFace,
}: SponsorBuildingProps) {
  const logoRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);

  const shellColor = useMemo(() => {
    const c = new THREE.Color(themeFace);
    c.multiplyScalar(1.8);
    return "#" + c.getHexString();
  }, [themeFace]);
  const windowOff = useMemo(() => {
    const c = new THREE.Color(themeFace);
    c.multiplyScalar(0.6);
    return "#" + c.getHexString();
  }, [themeFace]);

  const txCol = Math.floor((MIN_COLS - TXT_W) / 2);

  // Main slab textures — text on front/back
  const mainFront = useMemo(() =>
    createGlassTex(MIN_COLS, 20, 51, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, 1),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const mainFrontB = useMemo(() =>
    createGlassTex(MIN_COLS, 20, 107, themeWindowLit, windowOff, themeFace, themeAccent, TEXT_BM, txCol, 1),
    [themeWindowLit, windowOff, themeFace, themeAccent],
  );
  const mainSide = useMemo(() =>
    createGlassTex(9, 20, 82, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Side tower textures — no text
  const towerFront = useMemo(() =>
    createGlassTex(8, 28, 63, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const towerSide = useMemo(() =>
    createGlassTex(8, 28, 94, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  // Crown textures for tower top
  const crownF = useMemo(() =>
    createGlassTex(5, 3, 120, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );
  const crownS = useMemo(() =>
    createGlassTex(4, 3, 131, themeWindowLit, windowOff, themeFace),
    [themeWindowLit, windowOff, themeFace],
  );

  const allTex = [mainFront, mainFrontB, mainSide, towerFront, towerSide, crownF, crownS];
  useEffect(() => () => { for (const t of allTex) t.dispose(); }, allTex);

  const logo3D = useMemo(() => createAvocadoLogo(themeAccent), [themeAccent]);

  const shellMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.25, metalness: 0.8 }),
    [shellColor],
  );
  const shellMatLight = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.4, metalness: 0.5 }),
    [shellColor],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (logoRef.current) logoRef.current.rotation.y = t * 0.3;
    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        2 + Math.sin(t * 1.5) * 0.8;
    }
  });

  const emC = themeWindowLit[0] ?? "#fff";
  const crownW = TW - 10, crownD = TD - 10, crownH = 25;
  const crownY = TH / 2 + 4 + TH / 2 + crownH / 2;
  const towerTopY = crownY + crownH / 2;
  const topY = towerTopY + 55;

  return (
    <group>
      {/* ── Platform ── */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[MW + TW + 20, 3, MD + 20]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[MW + TW + 22, 1, MD + 22]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>

      {/* ── Main slab (wide, shorter) ── */}
      <BoxSection
        w={MW} h={MH} d={MD} y={MH / 2 + 4}
        shellMat={shellMat} glassFront={mainFront} glassSide={mainSide}
        emColor={emC} accent={themeAccent}
      />

      {/* Main slab back face with text too */}
      <GlassFacade tex={mainFrontB} w={MW} h={MH} pos={[0, MH / 2 + 4, -MD / 2 - 0.3]} rotY={Math.PI} emColor={emC} />

      {/* Main slab top trim */}
      <mesh position={[0, MH + 4, 0]}>
        <boxGeometry args={[MW + 4, 1.2, MD + 4]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* Main slab rooftop pad */}
      <mesh position={[0, MH + 5.5, 0]}>
        <boxGeometry args={[MW - 8, 2, MD - 8]} />
        <primitive object={shellMatLight} attach="material" />
      </mesh>
      <mesh position={[0, MH + 7, 0]}>
        <boxGeometry args={[MW - 6, 0.6, MD - 6]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>

      {/* Accent band at 50% of main slab */}
      <mesh position={[0, MH * 0.5 + 4, 0]}>
        <boxGeometry args={[MW + 2, 1.5, MD + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>

      {/* Text glow (main slab) */}
      <pointLight position={[0, MH * 0.72, MD / 2 + 20]} color={themeAccent} intensity={30} distance={80} decay={2} />
      <pointLight position={[0, MH * 0.72, -MD / 2 - 20]} color={themeAccent} intensity={30} distance={80} decay={2} />

      {/* ── Side tower (narrow, taller) ── */}
      <group position={[T_OFF, 0, 0]}>
        <BoxSection
          w={TW} h={TH} d={TD} y={TH / 2 + 4}
          shellMat={shellMat} glassFront={towerFront} glassSide={towerSide}
          emColor={emC} accent={themeAccent}
        />

        {/* Tower accent bands */}
        {[0.25, 0.5, 0.75].map((f, i) => (
          <mesh key={`tb-${i}`} position={[0, TH * f + 4, 0]}>
            <boxGeometry args={[TW + 2, 1.5, TD + 2]} />
            <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
          </mesh>
        ))}

        {/* Tower top trim */}
        <mesh position={[0, TH + 4, 0]}>
          <boxGeometry args={[TW + 4, 1.2, TD + 4]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
        </mesh>

        {/* Tower crown */}
        <mesh position={[0, TH + 4 + crownH / 2, 0]}>
          <boxGeometry args={[crownW, crownH, crownD]} />
          <primitive object={shellMat} attach="material" />
        </mesh>
        <GlassFacade tex={crownF} w={crownW} h={crownH} pos={[0, TH + 4 + crownH / 2, crownD / 2 + 0.3]} rotY={0} emColor={emC} />
        <GlassFacade tex={crownF} w={crownW} h={crownH} pos={[0, TH + 4 + crownH / 2, -crownD / 2 - 0.3]} rotY={Math.PI} emColor={emC} />
        <GlassFacade tex={crownS} w={crownD} h={crownH} pos={[crownW / 2 + 0.3, TH + 4 + crownH / 2, 0]} rotY={Math.PI / 2} emColor={emC} />
        <GlassFacade tex={crownS} w={crownD} h={crownH} pos={[-crownW / 2 - 0.3, TH + 4 + crownH / 2, 0]} rotY={-Math.PI / 2} emColor={emC} />
        <CornerStrips w={crownW} d={crownD} h={crownH} yC={TH + 4 + crownH / 2} accent={themeAccent} />

        {/* Crown top trim */}
        <mesh position={[0, TH + 4 + crownH, 0]}>
          <boxGeometry args={[crownW + 4, 1.2, crownD + 4]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
        </mesh>

        {/* Rooftop pad */}
        <mesh position={[0, TH + 4 + crownH + 2, 0]}>
          <boxGeometry args={[crownW + 4, 2, crownD + 4]} />
          <primitive object={shellMatLight} attach="material" />
        </mesh>
        <mesh position={[0, TH + 4 + crownH + 3.5, 0]}>
          <boxGeometry args={[crownW + 6, 0.6, crownD + 6]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={0.8} toneMapped={false} />
        </mesh>

        {/* Antenna */}
        <mesh position={[0, TH + 4 + crownH + 25, 0]}>
          <cylinderGeometry args={[0.5, 1.5, 42, 4]} />
          <meshStandardMaterial color={shellColor} roughness={0.2} metalness={0.9} />
        </mesh>
        <mesh position={[0, TH + 4 + crownH + 47, 0]}>
          <sphereGeometry args={[1.5, 6, 6]} />
          <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2} toneMapped={false} />
        </mesh>
      </group>

      {/* ── Skybridge connecting main slab to tower ── */}
      <mesh position={[MW / 2 - 4, BRIDGE_Y, 0]}>
        <boxGeometry args={[TW + 16, BRIDGE_H, MD * 0.55]} />
        <primitive object={shellMat} attach="material" />
      </mesh>
      {/* Bridge glass (front/back) */}
      {[1, -1].map((zSign, i) => (
        <mesh key={`bg-${i}`} position={[MW / 2 - 4, BRIDGE_Y, zSign * (MD * 0.55 / 2 + 0.3)]} rotation={[0, zSign < 0 ? Math.PI : 0, 0]}>
          <planeGeometry args={[TW + 12, BRIDGE_H - 4]} />
          <meshStandardMaterial color={themeFace} emissive={themeWindowLit[0] ?? "#fff"} emissiveIntensity={0.4} toneMapped={false} transparent opacity={0.6} />
        </mesh>
      ))}
      {/* Bridge accent trim */}
      <mesh position={[MW / 2 - 4, BRIDGE_Y + BRIDGE_H / 2 + 0.5, 0]}>
        <boxGeometry args={[TW + 18, 1, MD * 0.55 + 2]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* ── Avocado Logo (on tower top) ── */}
      <group ref={logoRef} position={[T_OFF, topY, 0]}>
        <primitive object={logo3D} />
        <pointLight color={themeAccent} intensity={40} distance={100} decay={2} />
      </group>

      {/* ── Beacon ── */}
      <mesh ref={beaconRef} position={[T_OFF, topY + 22, 0]}>
        <sphereGeometry args={[2.5, 8, 8]} />
        <meshStandardMaterial color={themeAccent} emissive={themeAccent} emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[T_OFF, topY + 22, 0]} color={themeAccent} intensity={20} distance={100} decay={2} />

      {/* ── Entrance glow ── */}
      <pointLight position={[0, 12, MD / 2 + 10]} color={themeAccent} intensity={15} distance={40} decay={2} />
    </group>
  );
}
