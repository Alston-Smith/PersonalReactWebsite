/**
 * SolarSystem.jsx
 * Full Keplerian Orbital Mechanics Simulator
 *
 * Orbital Variables (shape):
 *   ra    — Apoapsis   : farthest  point from focus (true anomaly = π)
 *   rp    — Periapsis  : nearest   point from focus (true anomaly = 0)
 *   a     — Semi-major axis = (ra + rp) / 2          [derived]
 *   e     — Eccentricity   = (ra − rp) / (ra + rp)  [derived]
 *
 * Rotation Variables (orientation):
 *   i     — Inclination              : tilt of orbital plane vs reference plane
 *   Omega — Longitude of Asc. Node  : Ω, rotation to ascending node
 *   omega — Argument of Periapsis   : ω, orientation within orbital plane
 *
 * Solver: Newton-Raphson on Kepler's Equation  M = E − e·sin(E)
 * Projection: 3-D Cartesian → orthographic 2-D (x right, y up)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import "./SolarSystem.css";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const AUtoPX = 200; // 1 AU = 200 display px (zoom = 1)
const radiusScale = 0.001; // Scale factor for planet radius in px (for display)
const SOLAR_RADIUS_AU = 0.00465047; // Sun radius in AU (~695,700 km)


// ─────────────────────────────────────────────────────────────────────────────
// ORBITAL MECHANICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Newton-Raphson solver for Kepler's Equation: M = E − e·sin(E)
 * @param {number} M  Mean anomaly (radians)
 * @param {number} e  Eccentricity
 * @returns {number}  Eccentric anomaly E (radians)
 */
function solveKepler(M, e) {
	M = ((M % TWO_PI) + TWO_PI) % TWO_PI;          // normalise to [0, 2π]
	let E = e < 0.8 ? M : Math.PI;                 // initial guess
	for (let n = 0; n < 100; n++) {
		const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
		E -= dE;
		if (Math.abs(dE) < 1e-12) break;
	}
	return E;
}

/**
 * Eccentric anomaly → true anomaly
 * ν = 2·atan2( √(1+e)·sin(E/2),  √(1−e)·cos(E/2) )
 */
function E2nu(E, e) {
	return 2 * Math.atan2(
		Math.sqrt(1 + e) * Math.sin(E / 2),
		Math.sqrt(1 - e) * Math.cos(E / 2),
	);
}

/**
 * Keplerian elements + true anomaly → 3-D Cartesian position.
 *
 * Applies the full rotation matrix  Rz(Ω) · Rx(i) · Rz(ω)
 * to the perifocal position vector.
 *
 * Screen mapping (orthographic):
 *   screen_x = canvas_cx + pos.x * scale
 *   screen_y = canvas_cy − pos.y * scale   (y-up → y-down flip)
 *
 * @param {number} a     Semi-major axis
 * @param {number} e     Eccentricity
 * @param {number} nu    True anomaly ν (rad)
 * @param {number} inc   Inclination  i (rad)
 * @param {number} Omega Long. ascending node Ω (rad)
 * @param {number} omega Arg. of periapsis    ω (rad)
 * @returns {{x,y,z}}
 */
function kep2xyz(a, e, nu, inc, Omega, omega) {
	const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));  // r = a(1−e²)/(1+e·cosν)
	const xp = r * Math.cos(nu);                              // perifocal frame
	const yp = r * Math.sin(nu);

	const cO = Math.cos(Omega), sO = Math.sin(Omega);
	const co = Math.cos(omega), so = Math.sin(omega);
	const cI = Math.cos(inc), sI = Math.sin(inc);

	return {
		x: (cO * co - sO * so * cI) * xp + (-cO * so - sO * co * cI) * yp,
		y: (sO * co + cO * so * cI) * xp + (-sO * so + cO * co * cI) * yp,
		z: (so * sI) * xp + (co * sI) * yp,
	};
}

/** Position of a body at simulation time t (seconds) */
function posAtTime(t, body) {
	const M = (TWO_PI / body.period) * t;
	const E = solveKepler(M, body.e);
	return kep2xyz(body.a, body.e, E2nu(E, body.e), body.i, body.Omega, body.omega);
}

/** Pre-compute orbit ellipse polyline (body-local coords, 241 pts) */
function buildOrbit(body, steps = 240) {
	return Array.from({ length: steps + 1 }, (_, k) =>
		kep2xyz(body.a, body.e, (k / steps) * TWO_PI, body.i, body.Omega, body.omega),
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// SOLAR SYSTEM DATA
// ─────────────────────────────────────────────────────────────────────────────
// Distances ra / rp in display px (at zoom = 1).
// inc / Omega / omega in degrees (converted to rad during prepare()).
// period in simulation seconds.
// 200 px = 1 AU = 149,597,870.7 km
import orbitalData from "../data/orbital_params.json";
import * as XLSX from "xlsx";

function convertImportedBodies(rows) {
	// rows are objects with at least 'name' and optional 'parent' and other props
	const map = new Map();
	rows.forEach(r => {
		const name = String(r.name);
		const entry = { ...r };
		// ensure certain fields exist to match previous expectations
		if (entry.moons == null) entry.moons = [];
		map.set(name, entry);
	});

	const roots = [];
	for (const entry of map.values()) {
		const parent = entry.parent ? String(entry.parent) : 'Sol';
		if (!parent || parent.toLowerCase() === 'sol' || parent.toLowerCase() === 'sun') {
			roots.push(entry);
		} else {
			const p = map.get(parent);
			if (p) p.moons = p.moons || [], p.moons.push(entry);
			else roots.push(entry);
		}
	}
	return roots;
}


const RAW_BODIES = (Array.isArray(orbitalData) && orbitalData.length)
	? convertImportedBodies(orbitalData)
	: [
		{
			name: "Mercury", color: "#b5b5b5", glow: "rgba(181,181,181,0.55)", r: 2440 * radiusScale,
			ra: 0.4667 * AUtoPX, rp: 0.3075 * AUtoPX, inc: 0, Omega: 48.3, omega: 29.1, period: 5.5,
			moons: [],
		},
		{
			name: "Venus", color: "#e8d090", glow: "rgba(232,208,144,0.55)", r: 6052 * radiusScale,
			ra: 0.7282 * AUtoPX, rp: 0.7184 * AUtoPX, inc: 0, Omega: 76.7, omega: 54.9, period: 10.0,
			moons: [],
		},
		{
			name: "Earth", color: "#4fa3e0", glow: "rgba(79,163,224,0.55)", r: 6371 * radiusScale,
			ra: 1.0167 * AUtoPX, rp: 0.9833 * AUtoPX, inc: 0, Omega: 0, omega: 102.9, period: 18.0,
			moons: [
				{
					name: "Luna", color: "#d0d0d0", glow: "rgba(208,208,208,0.5)", r: 1737 * radiusScale,
					ra: 22, rp: 20, inc: 0, Omega: 125.1, omega: 318.2, period: 1.50
				},
			],
		},
		{
			name: "Mars", color: "#c1440e", glow: "rgba(193,68,14,0.55)", r: 3390 * radiusScale,
			ra: 1.6660 * AUtoPX, rp: 1.3814 * AUtoPX, inc: 0, Omega: 49.6, omega: 286.5, period: 26.0,
			moons: [
				{
					name: "Phobos", color: "#aaaaaa", glow: "rgba(170,170,170,0.4)", r: 11.27 * radiusScale,
					ra: 14, rp: 13, inc: 0, Omega: 207.0, omega: 150.1, period: 0.28
				},
				{
					name: "Deimos", color: "#999999", glow: "rgba(153,153,153,0.4)", r: 6.2 * radiusScale,
					ra: 20, rp: 19, inc: 0, Omega: 24.0, omega: 260.4, period: 0.55
				},
			],
		},
		{
			name: "Jupiter", color: "#c88b3a", glow: "rgba(200,139,58,0.55)", r: 69911 * radiusScale,
			ra: 5.458 * AUtoPX, rp: 4.950 * AUtoPX, inc: 0, Omega: 100.5, omega: 14.3, period: 54.0,
			moons: [
				{
					name: "Io", color: "#e8d080", glow: "rgba(232,208,128,0.4)", r: 1822 * radiusScale,
					ra: 28, rp: 27, inc: 0, Omega: 43, omega: 84, period: 0.45
				},
				{
					name: "Europa", color: "#c8c0b0", glow: "rgba(200,192,176,0.4)", r: 1561 * radiusScale,
					ra: 38, rp: 37, inc: 0, Omega: 219, omega: 88, period: 0.85
				},
				{
					name: "Ganymede", color: "#b8a090", glow: "rgba(184,160,144,0.4)", r: 2634 * radiusScale,
					ra: 52, rp: 51, inc: 0, Omega: 63, omega: 192, period: 1.70
				},
				{
					name: "Callisto", color: "#908880", glow: "rgba(144,136,128,0.4)", r: 2410 * radiusScale,
					ra: 70, rp: 68, inc: 0, Omega: 298, omega: 52, period: 3.40
				},
			],
		},
		{
			name: "Saturn", color: "#e4d191", glow: "rgba(228,209,145,0.55)", r: 58232 * radiusScale, hasRings: true,
			ra: 10.121 * AUtoPX, rp: 9.044 * AUtoPX, inc: 0, Omega: 113.7, omega: 92.4, period: 88.0,
			moons: [
				{
					name: "Mimas", color: "#d0d0d0", glow: "rgba(208,208,208,0.4)", r: 198 * radiusScale,
					ra: 22, rp: 21, inc: 0, Omega: 130, omega: 106, period: 0.38
				},
				{
					name: "Enceladus", color: "#f4f4f4", glow: "rgba(244,244,244,0.4)", r: 252 * radiusScale,
					ra: 28, rp: 27, inc: 0, Omega: 170, omega: 93, period: 0.58
				},
				{
					name: "Tethys", color: "#d8d8c8", glow: "rgba(216,216,200,0.4)", r: 530 * radiusScale,
					ra: 36, rp: 35, inc: 0, Omega: 210, omega: 45, period: 0.78
				},
				{
					name: "Dione", color: "#c8c8c0", glow: "rgba(200,200,192,0.4)", r: 561 * radiusScale,
					ra: 46, rp: 45, inc: 0, Omega: 290, omega: 22, period: 1.08
				},
				{
					name: "Rhea", color: "#d0c8b8", glow: "rgba(208,200,184,0.4)", r: 764 * radiusScale,
					ra: 57, rp: 56, inc: 0, Omega: 352, omega: 241, period: 1.58
				},
				{
					name: "Titan", color: "#e8a840", glow: "rgba(232,168,64,0.4)", r: 2575 * radiusScale,
					ra: 88, rp: 86, inc: 0, Omega: 169, omega: 185, period: 3.70
				},
				{
					name: "Iapetus", color: "#c0a090", glow: "rgba(192,160,144,0.4)", r: 735 * radiusScale,
					ra: 128, rp: 126, inc: 0, Omega: 75, omega: 271, period: 11.2
				},
			],
		},
		{
			name: "Uranus", color: "#7de8e8", glow: "rgba(125,232,232,0.55)", r: 25362 * radiusScale,
			ra: 20.150 * AUtoPX, rp: 18.286 * AUtoPX, inc: 0, Omega: 74.0, omega: 170.9, period: 155.0,
			moons: [
				{
					name: "Miranda", color: "#d0d0d0", glow: "rgba(208,208,208,0.4)", r: 236 * radiusScale,
					ra: 20, rp: 20, inc: 0, Omega: 326, omega: 68, period: 0.35
				},
				{
					name: "Ariel", color: "#c8d0d0", glow: "rgba(200,208,208,0.4)", r: 579 * radiusScale,
					ra: 30, rp: 30, inc: 0, Omega: 115, omega: 115, period: 0.65
				},
				{
					name: "Umbriel", color: "#909090", glow: "rgba(144,144,144,0.4)", r: 585 * radiusScale,
					ra: 40, rp: 39, inc: 0, Omega: 84, omega: 84, period: 1.00
				},
				{
					name: "Titania", color: "#b8c0c0", glow: "rgba(184,192,192,0.4)", r: 789 * radiusScale,
					ra: 53, rp: 52, inc: 0, Omega: 284, omega: 284, period: 1.70
				},
				{
					name: "Oberon", color: "#a8a0a0", glow: "rgba(168,160,160,0.4)", r: 761 * radiusScale,
					ra: 65, rp: 64, inc: 0, Omega: 148, omega: 148, period: 2.30
				},
			],
		},
		{
			name: "Neptune", color: "#3f54ba", glow: "rgba(63,84,186,0.55)", r: 24622 * radiusScale,
			ra: 30.33 * AUtoPX, rp: 29.81 * AUtoPX, inc: 0, Omega: 131.8, omega: 45.0, period: 280.0,
			moons: [
				{
					name: "Naiad", color: "#a0a0b0", glow: "rgba(160,160,176,0.4)", r: 33.4 * radiusScale,
					ra: 20, rp: 19, inc: 0, Omega: 331, omega: 299, period: 0.20
				},
				{
					name: "Proteus", color: "#909090", glow: "rgba(144,144,144,0.4)", r: 210 * radiusScale,
					ra: 32, rp: 31, inc: 0, Omega: 38, omega: 92, period: 0.45
				},
				{
					name: "Triton", color: "#c0c8d0", glow: "rgba(192,200,208,0.4)", r: 1353 * radiusScale,
					ra: 52, rp: 51, inc: 0, Omega: 177, omega: 66, period: 1.10
				},
			],
		},
	];

/** Derive a, e; convert degree angles to radians; pre-build orbit path */
function prepare(raw) {
	const a = (raw.ra + raw.rp) / 2;
	const e = (raw.ra - raw.rp) / (raw.ra + raw.rp);
	const body = {
		...raw, a, e,
		i: raw.inc * DEG,
		Omega: raw.Omega * DEG,
		omega: raw.omega * DEG,
	};
	body.orbit = buildOrbit(body);
	body.moons = (raw.moons || []).map(m => {
		const ma = (m.ra + m.rp) / 2;
		const me = (m.ra - m.rp) / (m.ra + m.rp);
		const moon = { ...m, a: ma, e: me, i: m.inc * DEG, Omega: m.Omega * DEG, omega: m.omega * DEG };
		moon.orbit = buildOrbit(moon);
		return moon;
	});
	return body;
}

// BODIES will be derived from RAW_BODIES at runtime (inside component) to allow dynamic loading.

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS DRAW HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function genStars(n, w, h) {
	return Array.from({ length: n }, () => ({
		x: Math.random() * w, y: Math.random() * h,
		r: Math.random() * 1.4 + 0.2,
		a: Math.random() * 0.55 + 0.15,
		phase: Math.random() * TWO_PI,
	}));
}

function lightenHex(hex, amt) {
	const n = parseInt(hex.replace('#', ''), 16);
	const r = Math.min(255, ((n >> 16) & 255) + amt);
	const g = Math.min(255, ((n >> 8) & 255) + amt);
	const b = Math.min(255, ((n) & 255) + amt);
	return `rgb(${r},${g},${b})`;
}

function drawOrbitLine(ctx, pts, ox, oy, sc, color, alpha) {
	if (!pts.length) return;
	ctx.save();
	ctx.strokeStyle = "white";
	ctx.globalAlpha = 1;
	ctx.lineWidth = 0.7;
	ctx.setLineDash([5, 5]);
	ctx.beginPath();
	ctx.moveTo(ox + pts[0].x * sc, oy - pts[0].y * sc);
	for (let k = 1; k < pts.length; k++)
		ctx.lineTo(ox + pts[k].x * sc, oy - pts[k].y * sc);
	ctx.closePath();
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.restore();
}

function drawGlowDot(ctx, sx, sy, r, color, glowColor) {
	// Outer glow halo
	const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.5);
	gr.addColorStop(0, glowColor);
	gr.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = gr;
	ctx.beginPath(); ctx.arc(sx, sy, r * 3.5, 0, TWO_PI); ctx.fill();

	// Sphere surface with highlight
	const hl = lightenHex(color.startsWith('#') ? color : '#888888', 65);
	const bg = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.05, sx, sy, r);
	bg.addColorStop(0, hl);
	bg.addColorStop(1, color);
	ctx.fillStyle = bg;
	ctx.beginPath(); ctx.arc(sx, sy, r, 0, TWO_PI); ctx.fill();
}

function drawSun(ctx, cx, cy, sc) {
	// Draw the Sun scaled with the scene zoom so it remains the same relative size
	// compared to planets and their orbits. sc is the current zoom (scale).
	const sunR = Math.max(SOLAR_RADIUS_AU * 15 * AUtoPX * sc, 0.5); // in CSS pixels

	// Corona (scale relative to sunR)
	const coronaInner = sunR;
	const coronaOuter = Math.max(sunR * 4.6, sunR + 4);
	const corona = ctx.createRadialGradient(cx, cy, coronaInner, cx, cy, coronaOuter);
	corona.addColorStop(0, "rgba(255,200,50,0.28)");
	corona.addColorStop(0.5, "rgba(255,120,10,0.10)");
	corona.addColorStop(1, "rgba(255,80,0,0)");
	ctx.fillStyle = corona;
	ctx.beginPath(); ctx.arc(cx, cy, coronaOuter, 0, TWO_PI); ctx.fill();

	// Surface
	const sgInner = Math.max(sunR * 0.05, 0.5);
	const sgOffset = Math.max(sunR * 0.15, 1);
	const sg = ctx.createRadialGradient(cx - sgOffset, cy - sgOffset, sgInner, cx, cy, sunR);
	sg.addColorStop(0, "#fff8d0");
	sg.addColorStop(0.3, "#ffe060");
	sg.addColorStop(0.7, "#ffa020");
	sg.addColorStop(1, "#ff6000");
	ctx.fillStyle = sg;
	ctx.beginPath(); ctx.arc(cx, cy, sunR, 0, TWO_PI); ctx.fill();
}

function drawRings(ctx, sx, sy, pr) {
	ctx.save();
	ctx.translate(sx, sy);
	ctx.scale(1, 0.30);           // compress Y to give tilted-ring look
	[
		[pr * 1.30, pr * 1.75, "rgba(220,200,130,0.55)"],
		[pr * 1.80, pr * 2.20, "rgba(200,180,110,0.40)"],
		[pr * 2.25, pr * 2.60, "rgba(180,160,100,0.25)"],
	].forEach(([inner, outer, col]) => {
		ctx.lineWidth = outer - inner;
		ctx.strokeStyle = col;
		ctx.beginPath(); ctx.arc(0, 0, (inner + outer) / 2, 0, TWO_PI); ctx.stroke();
	});
	ctx.restore();
}

function drawSelectionRing(ctx, sx, sy, r, t) {
	ctx.save();
	const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
	ctx.strokeStyle = "#00ff88";
	ctx.lineWidth = 1.2;
	ctx.globalAlpha = 0.45 + 0.45 * pulse;
	ctx.setLineDash([5, 5]);
	ctx.beginPath(); ctx.arc(sx, sy, r + 5 + pulse * 4, 0, TWO_PI); ctx.stroke();
	ctx.setLineDash([]);
	ctx.restore();
}

function drawLabel(ctx, x, y, text, color, size, alpha = 0.85) {
	ctx.save();
	ctx.font = `${size}px "Courier New", monospace`;
	ctx.fillStyle = color;
	ctx.globalAlpha = alpha;
	ctx.fillText(text, x - ctx.measureText(text).width / 2, y);
	ctx.restore();
}

function drawApsisMarker(ctx, sx, sy, label, color) {
	ctx.save();
	ctx.fillStyle = color;
	ctx.strokeStyle = color;
	ctx.globalAlpha = 0.80;
	ctx.lineWidth = 1;
	// Diamond marker
	ctx.beginPath();
	ctx.moveTo(sx, sy - 4);
	ctx.lineTo(sx + 3, sy);
	ctx.lineTo(sx, sy + 4);
	ctx.lineTo(sx - 3, sy);
	ctx.closePath();
	ctx.fill();
	ctx.font = `9px "Courier New", monospace`;
	ctx.fillText(label, sx + 6, sy + 3);
	ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function SolarSystem() {
	const canvasRef = useRef(null);
	const animRef = useRef(null);
	const simTimeRef = useRef(0);
	const lastFrameRef = useRef(null);
	const speedRef = useRef(1);
	const pausedRef = useRef(false);
	const zoomRef = useRef(0.75);
	const labelsRef = useRef(true);
	const starsRef = useRef([]);
	const hitsRef = useRef([]);        // click-detection targets
	const selNameRef = useRef(null);
	// Panning / dragging refs (pixel offsets in CSS-pixel space)
	const panRef = useRef({ x: 0, y: 0 });
	const draggingRef = useRef(false);
	const dragStartRef = useRef({ x: 0, y: 0 });
	const panStartRef = useRef({ x: 0, y: 0 });
	const movedRef = useRef(false);

	const [paused, setPaused] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [zoom, setZoom] = useState(0.75);
	const [labels, setLabels] = useState(true);
	const [selected, setSelected] = useState(null);  // full body object or null
	const [dispTime, setDispTime] = useState(0);

	// Keep refs in sync with state
	useEffect(() => { speedRef.current = speed; }, [speed]);
	useEffect(() => { pausedRef.current = paused; }, [paused]);
	useEffect(() => { zoomRef.current = zoom; }, [zoom]);
	useEffect(() => { labelsRef.current = labels; }, [labels]);
	useEffect(() => { selNameRef.current = selected?.name ?? null; }, [selected]);

	// Runtime-loading: allow user to load an .xlsx at runtime and convert AU->px
	const [rawBodies, setRawBodies] = useState(RAW_BODIES);
	const fileInputRef = useRef(null);

	function normalizeHeader(h) { if (h == null) return ''; return String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
	function normalizeValue(v) { if (v === null) return null; if (typeof v === 'number') return v; const num = Number(String(v).replace(/,/g, '')); if (!Number.isNaN(num) && String(v).trim() !== '') return num; return String(v).trim(); }
	function convertAUFieldsToPX(obj) {
		const candidates = ['ra', 'rp', 'aphelion', 'perihelion', 'ra_au', 'rp_au', 'aphelion_au', 'perihelion_au'];
		for (const key of Object.keys(obj)) {
			const lk = String(key).toLowerCase();
			if (candidates.includes(lk)) {
				const val = obj[key];
				if (typeof val === 'number') obj[key] = val * AUtoPX;
				else if (typeof val === 'string') { const n = Number(val.replace(/,/g, '')); if (!Number.isNaN(n)) obj[key] = n * AUtoPX; }
			}
		}
	}

	// Helpers for colors/glow used when importing spreadsheet columns M (color) and N (glow)
	function randomHex() {
		const r = Math.floor(Math.random()*256);
		const g = Math.floor(Math.random()*256);
		const b = Math.floor(Math.random()*256);
		return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
	}
	function glowFromHex(hex, alpha = 0.45) {
		try {
			const n = parseInt(String(hex).replace('#',''), 16);
			const r = (n >> 16) & 255;
			const g = (n >> 8) & 255;
			const b = n & 255;
			return `rgba(${r},${g},${b},${alpha})`;
		} catch (err) {
			return `rgba(200,200,200,${alpha})`;
		}
	}

	function parseRowsToBodies(rows) {
		// Expect fixed column layout (row 0 = headers):
		// A: name, B: parent, C: ra (AU), D: rp (AU), E: inc (deg), F: Omega (deg), G: omega (deg)
		if (!rows || rows.length <= 1) return [];
		const dataRows = rows.slice(1); // skip header row

		const objs = dataRows.map(row => {
			const nameRaw = row[0];
			if (nameRaw == null || String(nameRaw).trim() === '') return null;
			const name = String(nameRaw).trim();
			const parentRaw = row[1] == null ? 'Sol' : String(row[1]).trim();
			const raRaw = row[2];
			const rpRaw = row[3];
			const incRaw = row[4];
			const OmegaRaw = row[5];
			const omegaRaw = row[6];

			const raNum = (raRaw == null) ? 0 : Number(String(raRaw).replace(/,/g, ''));
			const rpNum = (rpRaw == null) ? 0 : Number(String(rpRaw).replace(/,/g, ''));
			const incNum = (incRaw == null) ? 0 : Number(String(incRaw).replace(/,/g, ''));
			const OmegaNum = (OmegaRaw == null) ? 0 : Number(String(OmegaRaw).replace(/,/g, ''));
			const omegaNum = (omegaRaw == null) ? 0 : Number(String(omegaRaw).replace(/,/g, ''));
			const radiusKmRaw = row[11];
			const radiusKm = (radiusKmRaw == null) ? null : Number(String(radiusKmRaw).replace(/,/g, ''));

			// convert km -> px using AUtoPX (1 AU = 149,597,870.7 km)
			const PX_PER_KM = AUtoPX / 149597870.7;
			// enforce a visible minimum in CSS pixels (sheet radii are tiny when converted directly)
			const computedR = (radiusKm && Number.isFinite(radiusKm)) ? Math.max(radiusKm * PX_PER_KM, 2) : null;

			// Column M (index 12) = color, Column N (index 13) = glow
			const colorRaw = row[12];
			const glowRaw = row[13];
			const colorVal = (colorRaw == null || String(colorRaw).trim() === '') ? randomHex() : String(colorRaw).trim();
			const glowVal = (glowRaw == null || String(glowRaw).trim() === '') ? glowFromHex(colorVal, 0.45) : String(glowRaw).trim();

			const obj = {
				name,
				parent: (parentRaw === '' ? 'Sol' : parentRaw),
				// ra/rp supplied in AU in sheet — convert to px
				ra: Number.isFinite(raNum) ? raNum * AUtoPX : 0,
				rp: Number.isFinite(rpNum) ? rpNum * AUtoPX : 0,
				inc: Number.isFinite(incNum) ? incNum : 0,
				Omega: Number.isFinite(OmegaNum) ? OmegaNum : 0,
				omega: Number.isFinite(omegaNum) ? omegaNum : 0,
				// visual properties
				color: colorVal,
				glow: glowVal,
				// r in px: prefer radius from sheet (km -> px), fallback to a small default
				r: computedR !== null ? computedR : 6,
				// keep original radius in km for reference
				radiusKm: Number.isFinite(radiusKm) ? radiusKm : null,
				moons: [],
			};

			return obj;
		}).filter(Boolean);

		// build hierarchy
		const byName = new Map();
		objs.forEach(o => byName.set(String(o.name), { ...o, moons: [] }));
		const roots = [];
		for (const entry of byName.values()) {
			const parentName = entry.parent ? String(entry.parent) : 'Sol';
			if (!parentName || parentName.toLowerCase() === 'sol' || parentName.toLowerCase() === 'sun') roots.push(entry);
			else {
				const p = byName.get(parentName);
				if (p) p.moons = p.moons || [], p.moons.push(entry);
				else roots.push(entry);
			}
		}
		return roots;
	}

	const onLoadXlsxClick = useCallback(() => fileInputRef.current?.click(), []);
	const onFileChange = useCallback(async e => {
		const f = e.target.files?.[0]; if (!f) return;
		const data = await f.arrayBuffer();
		const wb = XLSX.read(data);
		const ws = wb.Sheets[wb.SheetNames[0]];
		const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
		const bodies = parseRowsToBodies(rows);
		if (bodies && bodies.length) setRawBodies(bodies);
		e.target.value = '';
	}, []);

	// Try to load default spreadsheet at runtime from common locations
	useEffect(() => {
		let cancelled = false;
		const tryPaths = [
			'/assets/OrbitalParameters.xlsx',
			'/OrbitalParameters.xlsx',
			'/src/assets/OrbitalParameters.xlsx',
			'../assets/OrbitalParameters.xlsx'
		];
		(async () => {
			for (const p of tryPaths) {
				try {
					const res = await fetch(p);
					if (!res || !res.ok) continue;
					const data = await res.arrayBuffer();
					const wb = XLSX.read(data);
					const ws = wb.Sheets[wb.SheetNames[0]];
					const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
					const bodies = parseRowsToBodies(rows);
					if (bodies && bodies.length) {
						if (!cancelled) setRawBodies(bodies);
						break;
					}
				} catch (err) {
					// ignore and try next path
				}
			}
		})();
		return () => { cancelled = true; };
	}, []);

	// derived bodies for simulation
	const BODIES = rawBodies.map(prepare);

	// ── Main animation loop ──────────────────────────────────────────────────
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;

		const resize = () => {
			const { width, height } = canvas.getBoundingClientRect();
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			starsRef.current = genStars(260, width, height);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(canvas);

		const ctx = canvas.getContext("2d");

		function frame(ts) {
			if (!lastFrameRef.current) lastFrameRef.current = ts;
			const dt = Math.min((ts - lastFrameRef.current) / 1000, 0.1);
			lastFrameRef.current = ts;

			if (!pausedRef.current) simTimeRef.current += dt * speedRef.current * 0.05;
			const t = simTimeRef.current;
			const sc = zoomRef.current;
			const sl = labelsRef.current;
			const sn = selNameRef.current;

			// Work in CSS-pixel space (scale by dpr once)
			const cw = canvas.width / dpr;
			const ch = canvas.height / dpr;
			const cx = cw / 2 + panRef.current.x;
			const cy = ch / 2 + panRef.current.y;

			ctx.save();
			ctx.scale(dpr, dpr);

			// ── Background ────────────────────────────────────────────────────
			ctx.fillStyle = "#050a0f";
			ctx.fillRect(0, 0, cw, ch);

			// Grid
			ctx.save();
			ctx.strokeStyle = "rgba(0,200,255,0.04)";
			ctx.lineWidth = 0.5;
			const gs = 64;
			for (let x = cx % gs; x < cw; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
			for (let y = cy % gs; y < ch; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
			ctx.restore();

			// Stars with gentle twinkle
			starsRef.current.forEach(s => {
				ctx.save();
				ctx.globalAlpha = s.a * (0.72 + 0.28 * Math.sin(t * 1.4 + s.phase));
				ctx.fillStyle = "#ffffff";
				ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TWO_PI); ctx.fill();
				ctx.restore();
			});

			// ── Planet orbit paths ────────────────────────────────────────────
			BODIES.forEach(b => drawOrbitLine(ctx, b.orbit, cx, cy, sc, b.color, sn === b.name ? 0.45 : 0.20));

			// ── Compute all body positions ────────────────────────────────────
			const hits = [];
			const frameData = BODIES.map(body => {
				const p = posAtTime(t, body);
				const sx = cx + p.x * sc;
				const sy = cy - p.y * sc;

				const moons = body.moons.map(m => {
					const mp = posAtTime(t, m);
					return { moon: m, sx: sx + mp.x * sc, sy: sy - mp.y * sc, z: mp.z };
				});

				hits.push({ name: body.name, sx, sy, r: body.r * sc + 6, isMoon: false, bodyRef: body });
				moons.forEach(({ moon, sx: msx, sy: msy }) => {
					hits.push({ name: moon.name, sx: msx, sy: msy, r: moon.r + 6, isMoon: true, bodyRef: moon });
				});

				return { body, sx, sy, z: p.z, moons };
			});
			hitsRef.current = hits;

			// ── Sort by depth (z) — furthest first (painter's algorithm) ──────
			const sorted = [...frameData].sort((a, b) => a.z - b.z);

			sorted.forEach(({ body, sx, sy, moons }) => {
				const pr = body.r * sc;
				const psel = sn === body.name;

				// Moon orbits (centered on planet's current position)
				body.moons.forEach(m =>
					drawOrbitLine(ctx, m.orbit, sx, sy, sc, m.color, sn === m.name ? 0.50 : psel ? 0.28 : 0.13),
				);

				// Moon bodies
				moons.forEach(({ moon, sx: msx, sy: msy }) => {
					const msel = sn === moon.name;
					if (msel) drawSelectionRing(ctx, msx, msy, moon.r, t);
					drawGlowDot(ctx, msx, msy, moon.r, moon.color, moon.glow);
					if (sl || msel)
						drawLabel(ctx, msx, msy + moon.r + 10, moon.name, "rgba(140,140,155,0.75)", 8.5);
				});

				// Saturn's rings (draw behind planet disk)
				if (body.hasRings) drawRings(ctx, sx, sy, pr);

				// Planet
				if (psel) drawSelectionRing(ctx, sx, sy, pr, t);
				drawGlowDot(ctx, sx, sy, pr, body.color, body.glow);
				if (sl || psel)
					drawLabel(ctx, sx, sy - pr - 7, body.name, body.color, 11);
			});

			// ── Sun (drawn after planets so it's never occluded) ─────────────
			drawSun(ctx, cx, cy, sc);

			// ── Apsis markers for selected body ──────────────────────────────

			if (sn) {
				const focusPlanet = BODIES.find(b => b.name === sn);
				const focusMoon = !focusPlanet && BODIES.flatMap(b => b.moons).find(m => m.name === sn);
				const focusBody = focusPlanet || focusMoon;

				if (focusBody) {
					let ox = cx, oy = cy;
					if (focusMoon) {
						const parent = BODIES.find(b => b.moons.some(m => m.name === sn));
						if (parent) {
							const pp = posAtTime(t, parent);
							ox = cx + pp.x * sc;
							oy = cy - pp.y * sc;
						}
					}
					// Periapsis (ν = 0) — nearest point to focus
					const peri = kep2xyz(focusBody.a, focusBody.e, 0, focusBody.i, focusBody.Omega, focusBody.omega);
					// Apoapsis  (ν = π) — farthest point from focus
					const apo = kep2xyz(focusBody.a, focusBody.e, Math.PI, focusBody.i, focusBody.Omega, focusBody.omega);

					drawApsisMarker(ctx, ox + peri.x * sc, oy - peri.y * sc, "rₚ  periapsis", "#ffcc44");
					drawApsisMarker(ctx, ox + apo.x * sc, oy - apo.y * sc, "rₐ  apoapsis", "#ff8844");
				}
			}

			ctx.restore();
			animRef.current = requestAnimationFrame(frame);
		}

		animRef.current = requestAnimationFrame(frame);
		return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
	}, []);   // intentionally runs once — all live values read via refs

	// Display time ticker (separate from render loop)
	useEffect(() => {
		const id = setInterval(() => setDispTime(Math.floor(simTimeRef.current)), 500);
		return () => clearInterval(id);
	}, []);

	// ── Wheel zoom (must be non-passive to call preventDefault) ───────────
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const onWheel = e => {
			e.preventDefault();
			setZoom(z => Math.max(0.28, Math.min(2.6, z - e.deltaY * 0.0008)));
		};
		canvas.addEventListener('wheel', onWheel, { passive: false });
		return () => canvas.removeEventListener('wheel', onWheel);
	}, []);

	// ── Mouse interactions: panning & click ──────────────────────────────
	const clickSuppressRef = useRef(false);

	const onMouseDown = useCallback(e => {
		if (e.button !== 0) return;
		draggingRef.current = true;
		movedRef.current = false;
		dragStartRef.current = { x: e.clientX, y: e.clientY };
		panStartRef.current = { ...panRef.current };
		const canvas = canvasRef.current; if (canvas) canvas.style.cursor = 'grabbing';
	}, []);

	const onMouseMove = useCallback(e => {
		if (!draggingRef.current) return;
		const dx = e.clientX - dragStartRef.current.x;
		const dy = e.clientY - dragStartRef.current.y;
		if (Math.hypot(dx, dy) > 2) movedRef.current = true;
		panRef.current = { x: panStartRef.current.x + dx, y: panStartRef.current.y + dy };
	}, []);

	const onMouseUp = useCallback(e => {
		if (e && e.button !== undefined && e.button !== 0) return;
		draggingRef.current = false;
		const canvas = canvasRef.current; if (canvas) canvas.style.cursor = 'grab';
		if (movedRef.current) {
			// suppress the click that follows mouseup after a drag
			movedRef.current = false;
			clickSuppressRef.current = true;
			setTimeout(() => { clickSuppressRef.current = false; }, 0);
		}
	}, []);

	const handleClick = useCallback(e => {
		if (clickSuppressRef.current) { clickSuppressRef.current = false; return; }
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		let best = null, bestDist = Infinity;
		hitsRef.current.forEach(h => {
			const d = Math.hypot(h.sx - mx, h.sy - my);
			if (d < bestDist && d < Math.max(h.r, 14)) { bestDist = d; best = h; }
		});

		setSelected(best ? best.bodyRef : null);
	}, []);

	const totalMoons = BODIES.reduce((s, b) => s + b.moons.length, 0);

	return (
		<div className="ss-root">

			{/* ── Header ── */}
			<header className="ss-header">
				<div className="ss-title-block">
					<span className="ss-title">⬡ Orbital Simulator</span>
					<span className="ss-subtitle"></span>
				</div>
				<div className="ss-controls">
					<button className={`ctrl-btn ${paused ? "active" : ""}`}
						onClick={() => setPaused(p => !p)}>
						{paused ? "▶ RESUME" : "⏸ PAUSE"}
					</button>

					<label className="ctrl-label">
						SPEED
						<select className="ctrl-select" value={speed}
							onChange={e => setSpeed(+e.target.value)}>
							{[0.25, 0.5, 1, 2, 5, 10, 25].map(s =>
								<option key={s} value={s}>{s}×</option>)}
						</select>
					</label>

					<label className="ctrl-label">
						ZOOM
						<select className="ctrl-select" value={zoom}
							onChange={e => setZoom(+e.target.value)}>
							{[0.35, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(z =>
								<option key={z} value={z}>{Math.round(z * 100)}%</option>)}
						</select>
					</label>

					<button className={`ctrl-btn ${labels ? "active" : ""}`}
						onClick={() => setLabels(l => !l)}>
						{labels ? "LABELS ✓" : "LABELS ○"}
					</button>

					<button className="ctrl-btn" onClick={onLoadXlsxClick}>LOAD XLSX</button>
				</div>
			</header>

			{/* ── Main ── */}
			<div className="ss-main">
				<div className="ss-canvas-wrap">
					<canvas
						ref={canvasRef}
						className="ss-canvas"
						onClick={handleClick}
						onMouseDown={onMouseDown}
						onMouseMove={onMouseMove}
						onMouseUp={onMouseUp}
						onMouseLeave={onMouseUp}
						style={{ cursor: 'grab' }}
					/>
					<input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onFileChange} />
				</div>

				<aside className="ss-panel">
					{selected
						? <BodyPanel body={selected} />
						: <SystemOverview bodies={BODIES} />}
				</aside>
			</div>

			{/* ── Footer ── */}
			<footer className="ss-footer">
				<span className="status-dot" />
				<span className="footer-stat">PLANETS <em>{BODIES.length}</em></span>
				<span className="footer-stat">MOONS <em>{totalMoons}</em></span>
				<span className="footer-stat">SIM·T <em>{fmtTime(dispTime)}</em></span>
				<span className="footer-stat">SPEED <em>{speed}×</em></span>
				<span className="footer-hint">SCROLL to zoom · CLICK body to inspect</span>
			</footer>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function BodyPanel({ body }) {
	const circular = body.e < 0.002;
	return (
		<div className="body-panel">
			<div className="panel-sec-title">Selected Body</div>

			<div className="body-name-row">
				<span className="body-swatch" style={{ background: body.color }} />
				<span className="body-name">{body.name}</span>
			</div>

			{/* Orbital shape */}
			<div className="panel-sec-title" style={{ marginTop: 16 }}>Orbital Shape</div>
			<ERow sym="rₐ" name="Apoapsis  (Q)" val={body.ra.toFixed(1)} unit="px" desc="True anomaly = π" />
			<ERow sym="rₚ" name="Periapsis (q)" val={body.rp.toFixed(1)} unit="px" desc="True anomaly = 0" />
			<ERow sym="a" name="Semi-Major Axis" val={body.a.toFixed(2)} unit="px" desc="(rₐ + rₚ) / 2" />
			<ERow sym="e" name="Eccentricity" val={body.e.toFixed(5)} desc="(rₐ − rₚ)/(rₐ + rₚ)" />

			{/* Orbital orientation */}
			<div className="panel-sec-title" style={{ marginTop: 16 }}>Orbital Orientation</div>
			<ERow sym="i" name="Inclination" val={(body.i / DEG).toFixed(2)} unit="°" desc="Tilt of orbital plane" />
			<ERow sym="Ω" name="Long. Ascending Node" val={(body.Omega / DEG).toFixed(1)} unit="°" desc="RAAN" />
			<ERow sym="ω" name="Arg. of Periapsis" val={circular ? "—" : (body.omega / DEG).toFixed(1)} unit={circular ? "" : "°"} desc="Orientation in plane" />
			<ERow sym="T" name="Orbital Period" val={body.period.toFixed(2)} unit="s" />

			{/* Moons */}
			{body.moons?.length > 0 && <>
				<div className="panel-sec-title" style={{ marginTop: 16 }}>
					Moons&nbsp;<span className="moon-count">({body.moons.length})</span>
				</div>
				{body.moons.map(m => (
					<div key={m.name} className="moon-row">
						<span className="body-swatch" style={{ background: m.color, width: 6, height: 6 }} />
						<span className="moon-name">{m.name}</span>
						<span className="moon-meta">e={m.e.toFixed(3)}</span>
						<span className="moon-meta">i={(m.i / DEG).toFixed(2)}°</span>
					</div>
				))}
			</>}
		</div>
	);
}

function ERow({ sym, name, val, unit = "", desc }) {
	return (
		<div className="elem-row" title={desc || ""}>
			<span className="elem-sym">{sym}</span>
			<span className="elem-name">{name}</span>
			<span className="elem-val">{val}<span className="elem-unit">{unit}</span></span>
		</div>
	);
}

function SystemOverview({ bodies }) {
	return (
		<div className="body-panel">
			<div className="panel-sec-title">Solar System</div>
			<p className="hint-text">Click any planet or moon to inspect its orbital elements.</p>

			{bodies.map(b => (
				<div key={b.name} className="legend-row">
					<span className="body-swatch" style={{ background: b.color }} />
					<span className="legend-name">{b.name}</span>
					<span className="legend-meta">{b.moons.length} moon{b.moons.length !== 1 ? "s" : ""}</span>
					<span className="legend-meta">e={b.e.toFixed(3)}</span>
				</div>
			))}

			<div className="panel-sec-title" style={{ marginTop: 18 }}>Element Glossary</div>
			{[
				["rₐ", "Apoapsis — farthest point (ν = π)"],
				["rₚ", "Periapsis — nearest point (ν = 0)"],
				["a", "Semi-major axis = (rₐ + rₚ) / 2"],
				["e", "Eccentricity   = (rₐ − rₚ)/(rₐ + rₚ)"],
				["i", "Inclination — tilt of orbital plane"],
				["Ω", "Longitude of Ascending Node (RAAN)"],
				["ω", "Argument of Periapsis — periapsis dir."],
			].map(([s, d]) => (
				<div key={s} className="def-row">
					<span className="def-sym">{s}</span>
					<span className="def-desc">{d}</span>
				</div>
			))}
		</div>
	);
}

function fmtTime(sec) {
	if (sec < 60) return `${sec}s`;
	if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
	return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}
