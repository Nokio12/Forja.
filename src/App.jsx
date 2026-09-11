import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import {
  Flame, Dumbbell, TrendingUp, Utensils, User, Check, X, Droplet,
  Award, Snowflake, ChevronRight, ChevronLeft, Plus, Search, Home,
  Repeat, Clock, Lock, Barcode, Minus, Trophy, Zap, ArrowRight,
  Mail, KeyRound, LogOut, Loader2, AlertCircle, Sun, Moon, Sparkles,
  Settings, Camera, Link2, Users, MessageCircle, Heart, MessageSquare,
  Send, Image as ImageIcon, ArrowLeft, Share2, MoreHorizontal, Trash2
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine
} from "recharts";

/* ============================================================
   SUPABASE — conexão direta via REST (sem SDK)
   ============================================================ */
// URL e chave pública vêm de variáveis de ambiente (.env, nunca commitado).
// A ANON_KEY é feita pra ser usada no navegador — não é um segredo como a
// GEMINI_API_KEY (essa nunca chega no frontend, mora só na Edge Function).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não definidas — confira seu arquivo .env");
}
// cliente oficial usado SÓ para Realtime (o resto do app já usa fetch puro
// contra a REST API — reimplementar o protocolo do Realtime na mão seria
// arriscado, então aqui vale usar o SDK testado da própria Supabase)
const supabaseRealtime = createClient(SUPABASE_URL, ANON_KEY);

async function sbAuth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || "Erro de autenticação");
  return data;
}
function sbHeaders(token) {
  return { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${token}` };
}
async function sbSelect(table, token, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders(token) });
  if (!res.ok) throw new Error(`Erro ao buscar ${table}`);
  return res.json();
}
async function sbInsert(table, token, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...sbHeaders(token), Prefer: "return=representation" }, body: JSON.stringify(rows),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Erro ao gravar em ${table}`);
  return data;
}
async function sbUpsert(table, token, rows, conflictCol) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictCol}`, {
    method: "POST",
    headers: { ...sbHeaders(token), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Erro ao salvar em ${table}`);
  return data;
}
async function sbUpdate(table, token, query, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH", headers: { ...sbHeaders(token), Prefer: "return=representation" }, body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Erro ao atualizar ${table}`);
  return data;
}
async function sbDelete(table, token, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { method: "DELETE", headers: sbHeaders(token) });
  if (!res.ok) throw new Error(`Erro ao remover de ${table}`);
}
// upload de imagem (Supabase Storage) — usado pelo feed da Comunidade
async function sbUploadFile(bucket, token, path, file) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Falha ao enviar imagem."); }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/* ============================================================
   SESSÃO PERSISTENTE — localStorage (projeto nativo, fora do
   sandbox de artifacts). Sobrevive a F5.
   ============================================================ */
const SESSION_KEY = "forja_session";
function persistRefreshToken(refresh_token) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ refresh_token })); } catch (e) { /* best-effort */ }
}
function clearPersistedSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* best-effort */ }
}
async function tryRestoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { refresh_token } = JSON.parse(raw);
    if (!refresh_token) return null;
    const data = await sbAuth("token?grant_type=refresh_token", { refresh_token });
    if (!data.access_token) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/* ============================================================
   TOKENS — objeto T é mutado em runtime pelo toggle de tema
   (não reatribuído), então todo componente que lê T.xxx no
   render pega o valor atual automaticamente.
   ============================================================ */
const FONTS_LINK = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap";
const THEME_DARK = {
  bg: "#121317", surface: "#1B1D23", surface2: "#23262D", line: "#2E323B",
  flame: "#FF5A36", flame2: "#FFB238", volt: "#C8FF4D", steel: "#8A93A3",
  steelDim: "#585F6B", ink: "#F2F1ED", blue: "#5C8DE0", red: "#E5484D",
};
const THEME_LIGHT = {
  bg: "#F4F3EF", surface: "#FFFFFF", surface2: "#EFEDE7", line: "#DEDBD3",
  flame: "#E0501F", flame2: "#C97A12", volt: "#5B8A00", steel: "#6B7280",
  steelDim: "#9CA3AF", ink: "#181A1E", blue: "#2D5FB8", red: "#D93A3E",
};
const T = { ...THEME_DARK };
function applyTheme(mode) { Object.assign(T, mode === "light" ? THEME_LIGHT : THEME_DARK); }
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
const THEME_KEY = "forja_theme";
function persistTheme(mode) { try { localStorage.setItem(THEME_KEY, mode); } catch (e) {} }
function readPersistedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
}

/* ============================================================
   LABELS
   ============================================================ */
const EQUIP_LABEL = { completa: "Academia comercial completa", basica: "Academia básica de condomínio", casa: "Em casa / Calistenia" };
const OBJ_PRINCIPAL_LABEL = { hipertrofia: "Hipertrofia", emagrecimento: "Emagrecimento", condicionamento: "Condicionamento físico", forca: "Aumento de força" };
const EXP_LABEL = { iniciante: "Iniciante", intermediario: "Intermediário", avancado: "Avançado" };
const FOCO_LABEL = { corpo_inteiro: "Corpo inteiro", superior: "Membros superiores", inferior: "Membros inferiores", core: "Abdômen e core" };
const OBJ_TO_MACRO = { hipertrofia: "bulking", emagrecimento: "cutting", condicionamento: "manutencao", forca: "bulking" };
const ACTIVITY_FACTOR = { sedentario: 1.2, leve: 1.35, moderado: 1.5, alto: 1.7 };
const EXP_ADJUST = { iniciante: -1, intermediario: 0, avancado: 1 };
const FOCUS_GROUPS = { superior: ["peito", "costas", "ombro", "bracos"], inferior: ["pernas"], corpo_inteiro: [], core: [] };
const TEMPO_MAX_EX = { ate30: 4, "45a60": 6, "1ha1h30": 8, mais1h30: 99 };
const TEMPO_LABEL = { ate30: "Até 30 min", "45a60": "45–60 min", "1ha1h30": "1h–1h30", mais1h30: "Mais de 1h30" };
const MEAL_SLOTS = [
  { id: "cafe", label: "Café da Manhã", hora: "08:00" },
  { id: "almoco", label: "Almoço", hora: "12:30" },
  { id: "pre_treino", label: "Pré-Treino", hora: "15:30" },
  { id: "jantar", label: "Jantar", hora: "20:00" },
];
function toMinutes(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function slotStatus(slot, nowMin) {
  const sorted = [...MEAL_SLOTS].sort((a, b) => toMinutes(a.hora) - toMinutes(b.hora));
  const idx = sorted.findIndex((s) => s.id === slot.id);
  const slotMin = toMinutes(slot.hora);
  const nextMin = idx < sorted.length - 1 ? toMinutes(sorted[idx + 1].hora) : 24 * 60;
  if (nowMin >= slotMin && nowMin < nextMin) return "agora";
  if (nowMin < slotMin) return "a_seguir";
  return "passada";
}

/* ============================================================
   DADOS DE EXERCÍCIOS
   ============================================================ */
const EXERCISE_POOL = {
  peito: {
    completa: [{ n: "Supino reto (barra)", s: 4, r: "8-10" }, { n: "Supino inclinado (halteres)", s: 3, r: "10-12" }, { n: "Crucifixo no cabo", s: 3, r: "12-15" }],
    basica: [{ n: "Supino reto (halteres)", s: 4, r: "8-10" }, { n: "Supino inclinado (halteres)", s: 3, r: "10-12" }, { n: "Flexão de braço", s: 3, r: "12-15" }],
    casa: [{ n: "Flexão de braço", s: 4, r: "10-15" }, { n: "Flexão inclinada (pés elevados)", s: 3, r: "8-12" }, { n: "Flexão diamante", s: 3, r: "8-12" }],
  },
  costas: {
    completa: [{ n: "Puxada frente (polia)", s: 4, r: "8-10" }, { n: "Remada curvada (barra)", s: 4, r: "8-10" }, { n: "Remada baixa (cabo)", s: 3, r: "10-12" }],
    basica: [{ n: "Remada unilateral (halter)", s: 4, r: "8-10" }, { n: "Remada curvada (halteres)", s: 4, r: "10-12" }, { n: "Pullover (halter)", s: 3, r: "12-15" }],
    casa: [{ n: "Barra fixa (pull-up)", s: 4, r: "max" }, { n: "Remada australiana", s: 4, r: "10-15" }, { n: "Superman", s: 3, r: "15" }],
  },
  pernas: {
    completa: [{ n: "Agachamento livre (barra)", s: 4, r: "6-8" }, { n: "Leg press", s: 4, r: "10-12" }, { n: "Cadeira extensora", s: 3, r: "12-15" }, { n: "Mesa flexora", s: 3, r: "12-15" }],
    basica: [{ n: "Agachamento goblet (halter)", s: 4, r: "10-12" }, { n: "Afundo búlgaro (halteres)", s: 3, r: "10-12" }, { n: "Stiff (halteres)", s: 3, r: "10-12" }],
    casa: [{ n: "Agachamento livre (peso corporal)", s: 4, r: "15-20" }, { n: "Afundo alternado", s: 4, r: "12-15" }, { n: "Elevação pélvica (glúteo)", s: 3, r: "15-20" }],
  },
  ombro: {
    completa: [{ n: "Desenvolvimento militar (barra)", s: 4, r: "8-10" }, { n: "Elevação lateral (halteres)", s: 3, r: "12-15" }],
    basica: [{ n: "Desenvolvimento (halteres)", s: 4, r: "8-10" }, { n: "Elevação lateral (halteres)", s: 3, r: "12-15" }],
    casa: [{ n: "Flexão pike", s: 4, r: "8-12" }, { n: "Flexão pike elevada", s: 3, r: "8-10" }],
  },
  bracos: {
    completa: [{ n: "Rosca direta (barra)", s: 3, r: "10-12" }, { n: "Tríceps corda (polia)", s: 3, r: "10-12" }],
    basica: [{ n: "Rosca alternada (halteres)", s: 3, r: "10-12" }, { n: "Tríceps francês (halter)", s: 3, r: "10-12" }],
    casa: [{ n: "Flexão fechada (tríceps)", s: 3, r: "10-15" }, { n: "Mergulho em banco (tríceps)", s: 3, r: "10-15" }],
  },
  core: {
    completa: [{ n: "Abdominal na polia alta", s: 3, r: "15" }, { n: "Elevação de pernas na paralela", s: 3, r: "12" }],
    basica: [{ n: "Prancha abdominal", s: 3, r: "45s" }, { n: "Abdominal solo", s: 3, r: "15-20" }],
    casa: [{ n: "Prancha abdominal", s: 3, r: "45s" }, { n: "Abdominal bicicleta", s: 3, r: "20" }],
  },
};
const ALT_MAP = {
  "Supino reto (barra)": ["Supino reto (halteres)", "Supino na máquina (smith)", "Flexão com pés elevados"],
  "Agachamento livre (barra)": ["Leg press", "Agachamento no smith", "Agachamento goblet (halter)"],
  "Puxada frente (polia)": ["Barra fixa (pull-up)", "Remada curvada (barra)", "Puxada unilateral (cabo)"],
  "Remada curvada (barra)": ["Remada unilateral (halter)", "Puxada frente (polia)", "Remada máquina"],
  "Desenvolvimento militar (barra)": ["Desenvolvimento (halteres)", "Desenvolvimento máquina", "Flexão pike"],
};
function altsFor(name) { return ALT_MAP[name] || ["Variação com halteres", "Variação na máquina", "Variação com peso corporal"]; }

const INJURY_EXCLUDE = {
  ombros_punhos: ["Desenvolvimento militar (barra)", "Desenvolvimento (halteres)", "Elevação lateral (halteres)", "Flexão pike", "Flexão pike elevada", "Supino reto (barra)", "Flexão de braço", "Flexão inclinada (pés elevados)", "Flexão diamante", "Rosca direta (barra)", "Rosca alternada (halteres)", "Flexão fechada (tríceps)"],
  joelhos: ["Agachamento livre (barra)", "Leg press", "Cadeira extensora", "Afundo búlgaro (halteres)", "Afundo alternado", "Agachamento livre (peso corporal)", "Agachamento goblet (halter)"],
  lombar: ["Remada curvada (barra)", "Stiff (halteres)", "Remada curvada (halteres)"],
  outra: [],
  nenhuma: [],
};

const NAME_TO_GROUP = {};
Object.entries(EXERCISE_POOL).forEach(([grupo, byEquip]) => {
  Object.values(byEquip).forEach((list) => list.forEach((ex) => { NAME_TO_GROUP[ex.n] = grupo; }));
});
const GROUP_LABEL = { peito: "Peito", costas: "Costas", pernas: "Pernas", ombro: "Ombro", bracos: "Braços", core: "Core" };

function buildSplit(dias) {
  if (dias <= 3) return [
    { nome: "Treino A — Peito / Ombro / Tríceps", grupos: ["peito", "ombro", "bracos"] },
    { nome: "Treino B — Costas / Bíceps", grupos: ["costas", "bracos"] },
    { nome: "Treino C — Pernas completo", grupos: ["pernas"] },
  ];
  if (dias === 4) return [
    { nome: "Treino A — Superior (força)", grupos: ["peito", "costas"] },
    { nome: "Treino B — Inferior (força)", grupos: ["pernas"] },
    { nome: "Treino C — Superior (volume)", grupos: ["ombro", "bracos"] },
    { nome: "Treino D — Inferior (volume)", grupos: ["pernas"] },
  ];
  return [
    { nome: "Push — Peito / Ombro / Tríceps", grupos: ["peito", "ombro", "bracos"] },
    { nome: "Pull — Costas / Bíceps", grupos: ["costas", "bracos"] },
    { nome: "Legs — Pernas", grupos: ["pernas"] },
    { nome: "Push 2", grupos: ["peito", "ombro"] },
    { nome: "Pull 2", grupos: ["costas", "bracos"] },
    { nome: "Legs 2", grupos: ["pernas"] },
  ].slice(0, dias);
}

function generatePlan(profile) {
  const split = buildSplit(profile.dias_semana);
  const lesao = profile.lesao_regiao || "nenhuma";
  const excluded = new Set(INJURY_EXCLUDE[lesao] || []);
  const expAdj = EXP_ADJUST[profile.nivel_experiencia] ?? 0;
  const focoGroups = FOCUS_GROUPS[profile.foco_muscular] || [];
  const maxEx = TEMPO_MAX_EX[profile.tempo_categoria] ?? 8;
  const equip = profile.equipamento;

  return split.map((dia, di) => {
    let exercicios = dia.grupos.flatMap((g) => {
      const pool = EXERCISE_POOL[g][equip] || EXERCISE_POOL[g].casa;
      const filtrado = pool.filter((ex) => !excluded.has(ex.n));
      const final = filtrado.length ? filtrado : pool;
      return final.map((ex, i) => {
        let series = ex.s + expAdj;
        if (focoGroups.includes(g)) series += 1;
        series = Math.max(2, series);
        return { id: `${di}-${g}-${i}`, nome: ex.n, series, reps: ex.r, grupo: g };
      });
    });
    if (exercicios.length > maxEx) exercicios = exercicios.slice(0, maxEx);
    if (profile.foco_muscular === "core") {
      const corePool = EXERCISE_POOL.core[equip] || EXERCISE_POOL.core.casa;
      corePool.forEach((ex, i) => exercicios.push({ id: `${di}-core-${i}`, nome: ex.n, series: ex.s, reps: ex.r, grupo: "core" }));
    }
    return { id: `d${di}`, nome: dia.nome, exercicios };
  });
}

/* ============================================================
   GERAÇÃO DE TREINO + DIETA VIA IA — chama a Edge Function do
   Supabase, que por sua vez chama a API gratuita do Google
   Gemini com a key protegida no servidor. A key nunca é
   exposta no navegador.
   ============================================================ */
async function generatePlanWithAI(params, accessToken) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ params }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Falha ao gerar treino com IA. Verifique se a Edge Function 'generate-plan' está publicada e a GEMINI_API_KEY configurada.");
  const treinos = data.treinos;
  if (!Array.isArray(treinos) || !treinos.length) throw new Error("A IA não retornou um plano válido. Tente novamente.");
  const plano = treinos.map((dia, di) => ({
    id: `d${di}`,
    nome: dia.nome || `Treino ${di + 1}`,
    exercicios: (dia.exercicios || []).map((ex, i) => ({
      id: `${di}-ai-${i}`, nome: ex.nome, series: Number(ex.series) || 3, reps: ex.reps || "10-12", grupo: ex.grupo || "peito",
    })),
  }));
  return { plano, dieta: Array.isArray(data.dieta) ? data.dieta : [] };
}

/* ============================================================
   BANCO DE ALIMENTOS (65 itens)
   ============================================================ */
const FOOD_DB = [
  { id: "f1", nome: "Peito de frango grelhado", unidade: "100g", kcal: 165, p: 31, c: 0, g: 3.6, veg: false },
  { id: "f2", nome: "Arroz branco cozido", unidade: "100g", kcal: 130, p: 2.7, c: 28, g: 0.3, veg: true },
  { id: "f3", nome: "Ovo cozido", unidade: "1 unidade", kcal: 78, p: 6.3, c: 0.6, g: 5.3, veg: true },
  { id: "f4", nome: "Batata doce cozida", unidade: "100g", kcal: 86, p: 1.6, c: 20, g: 0.1, veg: true },
  { id: "f5", nome: "Whey protein (scoop)", unidade: "30g", kcal: 120, p: 24, c: 3, g: 1.5, veg: true },
  { id: "f6", nome: "Banana", unidade: "1 unidade", kcal: 89, p: 1.1, c: 23, g: 0.3, veg: true },
  { id: "f7", nome: "Pão francês", unidade: "1 unidade", kcal: 150, p: 4.8, c: 29, g: 1.5, veg: true },
  { id: "f8", nome: "Azeite de oliva", unidade: "1 colher", kcal: 119, p: 0, c: 0, g: 13.5, veg: true },
  { id: "f9", nome: "Aveia em flocos", unidade: "40g", kcal: 152, p: 5.3, c: 27, g: 2.7, veg: true },
  { id: "f10", nome: "Tapioca", unidade: "50g", kcal: 172, p: 0, c: 42, g: 0, veg: true },
  { id: "f11", nome: "Carne bovina moída (patinho)", unidade: "100g", kcal: 172, p: 26, c: 0, g: 7, veg: false },
  { id: "f12", nome: "Filé de tilápia", unidade: "100g", kcal: 96, p: 20, c: 0, g: 1.7, veg: false },
  { id: "f13", nome: "Salmão grelhado", unidade: "100g", kcal: 208, p: 20, c: 0, g: 13, veg: false },
  { id: "f14", nome: "Atum em água (lata)", unidade: "100g", kcal: 116, p: 26, c: 0, g: 1, veg: false },
  { id: "f15", nome: "Lombo suíno", unidade: "100g", kcal: 143, p: 21, c: 0, g: 6, veg: false },
  { id: "f16", nome: "Peito de peru fatiado", unidade: "100g", kcal: 135, p: 24, c: 1, g: 4, veg: false },
  { id: "f17", nome: "Camarão cozido", unidade: "100g", kcal: 99, p: 24, c: 0.2, g: 0.3, veg: false },
  { id: "f18", nome: "Queijo cottage", unidade: "100g", kcal: 98, p: 11, c: 3.4, g: 4.3, veg: true },
  { id: "f19", nome: "Queijo minas frescal", unidade: "100g", kcal: 264, p: 17, c: 3, g: 20, veg: true },
  { id: "f20", nome: "Iogurte natural desnatado", unidade: "100g", kcal: 41, p: 4, c: 6, g: 0.2, veg: true },
  { id: "f21", nome: "Leite desnatado", unidade: "100ml", kcal: 35, p: 3.4, c: 5, g: 0.1, veg: true },
  { id: "f22", nome: "Requeijão light", unidade: "100g", kcal: 140, p: 9, c: 4, g: 10, veg: true },
  { id: "f23", nome: "Feijão carioca cozido", unidade: "100g", kcal: 76, p: 4.8, c: 14, g: 0.5, veg: true },
  { id: "f24", nome: "Feijão preto cozido", unidade: "100g", kcal: 77, p: 4.5, c: 14, g: 0.5, veg: true },
  { id: "f25", nome: "Lentilha cozida", unidade: "100g", kcal: 116, p: 9, c: 20, g: 0.4, veg: true },
  { id: "f26", nome: "Grão de bico cozido", unidade: "100g", kcal: 164, p: 8.9, c: 27, g: 2.6, veg: true },
  { id: "f27", nome: "Quinoa cozida", unidade: "100g", kcal: 120, p: 4.4, c: 21, g: 1.9, veg: true },
  { id: "f28", nome: "Macarrão integral cozido", unidade: "100g", kcal: 124, p: 5, c: 25, g: 1.1, veg: true },
  { id: "f29", nome: "Pão integral", unidade: "1 fatia", kcal: 69, p: 3.6, c: 12, g: 1, veg: true },
  { id: "f30", nome: "Pão de forma tradicional", unidade: "1 fatia", kcal: 80, p: 2.6, c: 15, g: 1, veg: true },
  { id: "f31", nome: "Batata inglesa cozida", unidade: "100g", kcal: 77, p: 2, c: 17, g: 0.1, veg: true },
  { id: "f32", nome: "Mandioca cozida", unidade: "100g", kcal: 125, p: 0.6, c: 30, g: 0.3, veg: true },
  { id: "f33", nome: "Milho verde cozido", unidade: "100g", kcal: 98, p: 3.3, c: 21, g: 1.5, veg: true },
  { id: "f34", nome: "Cuscuz de milho", unidade: "100g", kcal: 112, p: 2.5, c: 24, g: 0.4, veg: true },
  { id: "f35", nome: "Granola", unidade: "100g", kcal: 471, p: 10, c: 64, g: 16, veg: true },
  { id: "f36", nome: "Pasta de amendoim integral", unidade: "1 colher", kcal: 95, p: 4, c: 3, g: 8, veg: true },
  { id: "f37", nome: "Castanha do Pará", unidade: "1 unidade", kcal: 33, p: 0.7, c: 0.6, g: 3.3, veg: true },
  { id: "f38", nome: "Amêndoas", unidade: "100g", kcal: 579, p: 21, c: 22, g: 50, veg: true },
  { id: "f39", nome: "Abacate", unidade: "100g", kcal: 160, p: 2, c: 8.5, g: 14.7, veg: true },
  { id: "f40", nome: "Maçã", unidade: "1 unidade", kcal: 95, p: 0.5, c: 25, g: 0.3, veg: true },
  { id: "f41", nome: "Morango", unidade: "100g", kcal: 32, p: 0.7, c: 7.7, g: 0.3, veg: true },
  { id: "f42", nome: "Laranja", unidade: "1 unidade", kcal: 62, p: 1.2, c: 15.4, g: 0.2, veg: true },
  { id: "f43", nome: "Mamão", unidade: "100g", kcal: 43, p: 0.5, c: 11, g: 0.1, veg: true },
  { id: "f44", nome: "Manga", unidade: "100g", kcal: 60, p: 0.8, c: 15, g: 0.4, veg: true },
  { id: "f45", nome: "Uva", unidade: "100g", kcal: 69, p: 0.7, c: 18, g: 0.2, veg: true },
  { id: "f46", nome: "Abacaxi", unidade: "100g", kcal: 50, p: 0.5, c: 13, g: 0.1, veg: true },
  { id: "f47", nome: "Brócolis cozido", unidade: "100g", kcal: 35, p: 2.4, c: 7, g: 0.4, veg: true },
  { id: "f48", nome: "Espinafre cozido", unidade: "100g", kcal: 23, p: 2.9, c: 3.6, g: 0.4, veg: true },
  { id: "f49", nome: "Cenoura crua", unidade: "100g", kcal: 41, p: 0.9, c: 10, g: 0.2, veg: true },
  { id: "f50", nome: "Tomate", unidade: "100g", kcal: 18, p: 0.9, c: 3.9, g: 0.2, veg: true },
  { id: "f51", nome: "Alface", unidade: "100g", kcal: 15, p: 1.4, c: 2.9, g: 0.2, veg: true },
  { id: "f52", nome: "Couve refogada", unidade: "100g", kcal: 49, p: 3.3, c: 6, g: 1, veg: true },
  { id: "f53", nome: "Abobrinha refogada", unidade: "100g", kcal: 20, p: 1.2, c: 3.1, g: 0.3, veg: true },
  { id: "f54", nome: "Ervilha cozida", unidade: "100g", kcal: 81, p: 5.4, c: 14, g: 0.4, veg: true },
  { id: "f55", nome: "Chia", unidade: "1 colher", kcal: 58, p: 2, c: 5, g: 3.7, veg: true },
  { id: "f56", nome: "Linhaça", unidade: "1 colher", kcal: 55, p: 1.9, c: 3, g: 4.3, veg: true },
  { id: "f57", nome: "Clara de ovo", unidade: "100g", kcal: 52, p: 11, c: 0.7, g: 0.2, veg: true },
  { id: "f58", nome: "Leite de amêndoas", unidade: "100ml", kcal: 17, p: 0.6, c: 0.6, g: 1.5, veg: true },
  { id: "f59", nome: "Tofu", unidade: "100g", kcal: 76, p: 8, c: 1.9, g: 4.8, veg: true },
  { id: "f60", nome: "Proteína de soja texturizada (hidratada)", unidade: "100g", kcal: 100, p: 18, c: 8, g: 0.5, veg: true },
  { id: "f61", nome: "Barra de proteína", unidade: "1 unidade", kcal: 200, p: 20, c: 18, g: 7, veg: true },
  { id: "f62", nome: "Chocolate 70% cacau", unidade: "100g", kcal: 598, p: 7.8, c: 46, g: 43, veg: true },
  { id: "f63", nome: "Mel", unidade: "1 colher", kcal: 64, p: 0.06, c: 17, g: 0, veg: true },
  { id: "f64", nome: "Água de coco", unidade: "100ml", kcal: 19, p: 0.25, c: 4.5, g: 0.05, veg: true },
  { id: "f65", nome: "Café preto sem açúcar", unidade: "100ml", kcal: 2, p: 0.1, c: 0, g: 0, veg: true },
];
function isCountUnit(unidade) {
  return unidade.includes("unidade") || unidade.includes("colher") || unidade.includes("scoop") || unidade.includes("fatia");
}
function defaultQtd(food) { return isCountUnit(food.unidade) ? 1 : 100; }
function unitFactor(food, qtd) { return isCountUnit(food.unidade) ? qtd : qtd / 100; }

function calcMacros(peso, objetivoPrincipal, nivelAtividade) {
  const macroObj = OBJ_TO_MACRO[objetivoPrincipal] || "manutencao";
  const factor = ACTIVITY_FACTOR[nivelAtividade] || 1.35;
  let kcal = peso * 24 * factor;
  if (macroObj === "bulking") kcal *= 1.15;
  if (macroObj === "cutting") kcal *= 0.8;
  const prot = peso * (macroObj === "cutting" ? 2.2 : 2.0);
  const gord = peso * 0.9;
  const carb = Math.max((kcal - prot * 4 - gord * 9) / 4, 0);
  return { kcal: Math.round(kcal), p: Math.round(prot), c: Math.round(carb), g: Math.round(gord) };
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

/* ============================================================
   UI PRIMITIVES
   ============================================================ */
function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: T.surface2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color, transition: "width .5s cubic-bezier(.4,0,.2,1)", borderRadius: 999 }} />
    </div>
  );
}
function Pill({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 14px", borderRadius: 999, fontFamily: "Inter", fontSize: 13, fontWeight: 600,
      border: `1px solid ${active ? T.flame : T.line}`, background: active ? hexToRgba(T.flame, 0.12) : "transparent",
      color: active ? T.flame2 : T.steel, cursor: "pointer", whiteSpace: "nowrap",
    }}>{children}</button>
  );
}
function Card({ children, style, onClick, className }) {
  return <div onClick={onClick} className={className} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 16, ...style }}>{children}</div>;
}
function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 0 10px" }}>
      <div style={{ fontFamily: "Bebas Neue", fontSize: 22, letterSpacing: 0.5, color: T.ink }}>{children}</div>
      {right}
    </div>
  );
}
function Spinner({ size = 22, color = T.flame }) {
  return <Loader2 size={size} color={color} style={{ animation: "spin 0.8s linear infinite" }} />;
}
function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 10, background: hexToRgba(T.red, 0.1), border: `1px solid ${T.red}`, marginBottom: 12 }}>
      <AlertCircle size={15} color={T.red} style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontFamily: "Inter", fontSize: 12.5, color: T.ink }}>{msg}</span>
    </div>
  );
}
function circleBtn(color) {
  return { width: 30, height: 30, borderRadius: "50%", border: `1px solid ${color || T.line}`, background: "transparent", color: color || T.steel, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
}
function FlameBadge({ size = 40, active = true }) {
  if (!active) {
    return (
      <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
        <Flame size={size} color={T.steelDim} fill={T.surface2} style={{ position: "relative" }} />
      </div>
    );
  }
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle, ${T.flame2}, ${T.flame} 70%)`, filter: "blur(2px)", opacity: 0.55, animation: "flicker 2.2s ease-in-out infinite" }} />
      <Flame size={size} color={T.flame2} fill={T.flame} style={{ position: "relative" }} />
    </div>
  );
}
function Sheet({ children, onClose }) {
  return (
    <div onClick={onClose} className="sheet-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-panel" style={{ background: T.surface, width: "100%", maxWidth: 430, margin: "0 auto", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, border: `1px solid ${T.line}`, borderBottom: "none" }}>
        {children}
      </div>
    </div>
  );
}
function EmptyState({ text }) {
  return <Card style={{ textAlign: "center", padding: 24, color: T.steel, fontFamily: "Inter", fontSize: 12.5 }}>{text}</Card>;
}

/* ============================================================
   AUTENTICAÇÃO
   ============================================================ */
/* ============================================================
   AUTH CONTEXT — estado global de autenticação (user, token,
   isAuthenticated). O AuthProvider valida a sessão salva no
   localStorage ANTES de qualquer rota protegida renderizar,
   exibindo uma Splash Screen enquanto isso.
   ============================================================ */
const AuthContext = React.createContext(null);
// nome digitado na tela de cadastro — não é estado de autenticação,
// só uma ponte curta até o app consumir e gravar no perfil
const pendingSignupName = { value: "", set(v) { this.value = v; }, take() { const v = this.value; this.value = ""; return v; } };
function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { token, refresh_token, user } | null
  const [authPhase, setAuthPhase] = useState("checking"); // checking | ready

  useEffect(() => {
    (async () => {
      const data = await tryRestoreSession();
      if (data) {
        setSession({ token: data.access_token, refresh_token: data.refresh_token, user: data.user });
        persistRefreshToken(data.refresh_token);
      }
      setAuthPhase("ready");
    })();
  }, []);

  async function login(email, senha) {
    const data = await sbAuth("token?grant_type=password", { email, password: senha });
    setSession({ token: data.access_token, refresh_token: data.refresh_token, user: data.user });
    persistRefreshToken(data.refresh_token);
    return data;
  }
  async function signup(email, senha) {
    const data = await sbAuth("signup", { email, password: senha });
    if (!data.access_token) {
      throw new Error("Cadastro criado, mas a confirmação por email está ativa no seu projeto Supabase. Desative 'Confirm email' em Authentication → Providers → Email para testar sem confirmar.");
    }
    setSession({ token: data.access_token, refresh_token: data.refresh_token, user: data.user });
    persistRefreshToken(data.refresh_token);
    return data;
  }
  function logout() {
    clearPersistedSession();
    setSession(null);
  }
  // usado quando uma chamada autenticada falha de forma irrecuperável
  // (token inválido/expirado) — derruba a sessão e volta pro login
  function invalidateSession() {
    clearPersistedSession();
    setSession(null);
  }
  // permite atualizar o objeto user local (ex: após trocar e-mail)
  function updateSessionUser(patch) {
    setSession((s) => s ? { ...s, user: { ...s.user, ...patch } } : s);
  }

  const value = { session, isAuthenticated: !!session, authPhase, login, signup, logout, invalidateSession, updateSessionUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function SplashScreen() {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
      <div style={{ fontFamily: "Bebas Neue", fontSize: 32, letterSpacing: 1, color: T.ink }}>FORJA<span style={{ color: T.flame }}>.</span></div>
      <Spinner size={26} />
    </div>
  );
}

function WelcomeModal({ nome, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 22, padding: "32px 26px", maxWidth: 340, width: "100%", textAlign: "center" }}
      >
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 300 }}>
          <FlameBadge size={56} />
        </motion.div>
        <div style={{ fontFamily: "Bebas Neue", fontSize: 26, color: T.ink, marginTop: 16 }}>Bem-vindo(a), {nome}<span style={{ color: T.flame }}>.</span></div>
        <div style={{ fontFamily: "Inter", fontSize: 13, color: T.steel, marginTop: 8, lineHeight: 1.5 }}>
          Sua conta está pronta. Vamos até a aba Treino deixar a IA forjar o seu primeiro plano?
        </div>
        <button onClick={onClose} style={{
          marginTop: 22, width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: "pointer",
          background: `linear-gradient(90deg, ${T.flame}, ${T.flame2})`, color: "#1B0D06",
          fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1,
        }}>COMEÇAR</button>
      </motion.div>
    </motion.div>
  );
}

function AuthScreen({ banner }) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      if (mode === "signup") {
        if (senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
        await signup(email, senha);
        pendingSignupName.set(nome);
      } else {
        await login(email, senha);
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: T.bg, color: T.ink, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px", fontFamily: "Inter" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontFamily: "Bebas Neue", fontSize: 40, letterSpacing: 1 }}>FORJA<span style={{ color: T.flame }}>.</span></div>
        <div style={{ color: T.steel, fontSize: 13, marginTop: 4 }}>Treino, dieta e progresso num só lugar</div>
      </div>

      <ErrorBox msg={banner} />

      <div style={{ display: "flex", background: T.surface, borderRadius: 12, padding: 4, marginBottom: 20, border: `1px solid ${T.line}` }}>
        {["login", "signup"].map((m) => (
          <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{
            flex: 1, padding: "10px", borderRadius: 9, border: "none", cursor: "pointer",
            background: mode === m ? T.flame : "transparent", color: mode === m ? "#1B0D06" : T.steel,
            fontFamily: "Inter", fontWeight: 700, fontSize: 13,
          }}>{m === "login" ? "Entrar" : "Criar conta"}</button>
        ))}
      </div>

      <ErrorBox msg={err} />

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "signup" && <InputField icon={User} placeholder="Seu nome" value={nome} onChange={setNome} required />}
        <InputField icon={Mail} placeholder="E-mail" type="email" value={email} onChange={setEmail} required />
        <InputField icon={KeyRound} placeholder="Senha (mín. 6 caracteres)" type="password" value={senha} onChange={setSenha} required />
        <button type="submit" disabled={loading} style={{
          marginTop: 8, padding: "16px", borderRadius: 14, border: "none", cursor: loading ? "default" : "pointer",
          background: `linear-gradient(90deg, ${T.flame}, ${T.flame2})`, color: "#1B0D06",
          fontFamily: "Bebas Neue", fontSize: 18, letterSpacing: 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {loading ? <Spinner size={18} color="#1B0D06" /> : <>{mode === "login" ? "ENTRAR" : "CRIAR CONTA"} <ArrowRight size={17} /></>}
        </button>
      </form>

      <div style={{ textAlign: "center", color: T.steelDim, fontSize: 11, marginTop: 20, lineHeight: 1.5 }}>
        Seus dados ficam salvos no seu banco Supabase, protegidos por conta.<br />Você continua logado mesmo recarregando a página.
      </div>
    </div>
  );
}
function InputField({ icon: Icon, value, onChange, ...props }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: "13px 14px" }}>
      <Icon size={16} color={T.steelDim} />
      <input {...props} value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.ink, fontFamily: "Inter", fontSize: 14 }} />
    </div>
  );
}

/* ============================================================
   ONBOARDING — 11 passos objetivos (10 do briefing + peso/altura)
   ============================================================ */
const QUESTIONS = [
  {
    key: "objetivo_principal", title: "Qual é o seu principal objetivo na academia?", sub: "Define o foco geral do plano.",
    options: [
      { id: "hipertrofia", label: "Hipertrofia", sub: "Ganho de massa muscular" },
      { id: "emagrecimento", label: "Emagrecimento", sub: "Perda de gordura" },
      { id: "condicionamento", label: "Condicionamento físico e saúde geral" },
      { id: "forca", label: "Aumento de força", sub: "Powerlifting / Performance" },
    ],
  },
  {
    key: "nivel_experiencia", title: "Qual é o seu nível de experiência atual com musculação?", sub: "Ajusta o volume inicial de séries.",
    options: [
      { id: "iniciante", label: "Iniciante", sub: "Nunca treinei ou treino há menos de 3 meses." },
      { id: "intermediario", label: "Intermediário", sub: "Treino regularmente há mais de 6 meses e conheço a execução dos principais exercícios." },
      { id: "avancado", label: "Avançado", sub: "Treino há mais de 2 anos, domínio total dos movimentos, busco quebras de platô." },
    ],
  },
  {
    key: "dias_semana", title: "Quantos dias por semana você tem disponibilidade real para treinar?", sub: "Define a divisão do treino.",
    options: [
      { id: 2, label: "2 dias por semana" }, { id: 3, label: "3 dias por semana" },
      { id: 4, label: "4 dias por semana" }, { id: 5, label: "5 ou mais dias por semana" },
    ],
  },
  {
    key: "tempo_categoria", title: "Quanto tempo você consegue dedicar a cada sessão de treino?", sub: "Incluindo aquecimento. Define quantos exercícios entram no treino.",
    options: [
      { id: "ate30", label: "Até 30 minutos", sub: "Treino rápido / Express" },
      { id: "45a60", label: "De 45 a 60 minutos" },
      { id: "1ha1h30", label: "De 1 hora a 1 hora e meia" },
      { id: "mais1h30", label: "Mais de 1 hora e meia" },
    ],
  },
  {
    key: "equipamento", title: "Onde você vai realizar os seus treinos?", sub: "A IA monta os exercícios com o que está disponível.",
    options: [
      { id: "completa", label: "Academia comercial completa", sub: "Máquinas, cabos, pesos livres" },
      { id: "basica", label: "Academia básica de condomínio", sub: "Halteres, barras e alguns aparelhos limitados" },
      { id: "casa", label: "Em casa / Calistenia", sub: "Peso corporal ou acessórios leves como elásticos" },
    ],
  },
  {
    key: "lesao_regiao", title: "Você possui alguma lesão, restrição médica ou dor crônica que a IA deva considerar?", sub: "A IA evita sobrecarregar a região selecionada.",
    options: [
      { id: "nenhuma", label: "Nenhuma restrição" },
      { id: "joelhos", label: "Sim, dor ou lesão nos joelhos" },
      { id: "lombar", label: "Sim, dor ou lesão na lombar / coluna" },
      { id: "ombros_punhos", label: "Sim, dor ou lesão nos ombros / punhos" },
      { id: "outra", label: "Outra restrição articular ou postural" },
    ],
  },
  {
    key: "foco_muscular", title: "Qual é o seu foco estético ou muscular prioritário?", sub: "Grupos priorizados recebem séries extras no plano.",
    options: [
      { id: "corpo_inteiro", label: "Corpo inteiro / Harmonioso", sub: "Foco igual em tudo" },
      { id: "superior", label: "Membros superiores", sub: "Peito, costas, braços e ombros" },
      { id: "inferior", label: "Membros inferiores", sub: "Glúteos, quadríceps e posteriores" },
      { id: "core", label: "Abdômen e core" },
    ],
  },
  {
    key: "faixa_etaria", title: "Qual é a sua faixa etária?", sub: "",
    options: [
      { id: "menor18", label: "Menos de 18 anos" }, { id: "18a25", label: "De 18 a 25 anos" },
      { id: "26a40", label: "De 26 a 40 anos" }, { id: "acima40", label: "Acima de 40 anos" },
    ],
  },
  {
    key: "nivel_atividade", title: "Qual é o seu nível atual de atividade diária fora da academia?", sub: "Usado no cálculo calórico.",
    options: [
      { id: "sedentario", label: "Sedentário", sub: "Passo a maior parte do dia sentado(a)" },
      { id: "leve", label: "Levemente ativo", sub: "Caminho um pouco, afazeres domésticos leves" },
      { id: "moderado", label: "Moderadamente ativo", sub: "Trabalho em pé ou me desloco bastante" },
      { id: "alto", label: "Altamente ativo", sub: "Trabalho físico pesado ou rotina muito intensa" },
    ],
  },
  {
    key: "dieta_tipo", title: "Você segue alguma dieta ou restrição alimentar específica?", sub: "Filtra as sugestões do diário de refeições.",
    options: [
      { id: "nenhuma", label: "Nenhuma restrição", sub: "Como de tudo" },
      { id: "flexivel", label: "Dieta Flexível / Contagem de Macros" },
      { id: "vegetariana", label: "Vegetariana ou Vegana" },
      { id: "lowcarb", label: "Low Carb / Cetogênica" },
    ],
  },
  {
    key: "refeicoes_dia", title: "Quantas refeições você costuma fazer por dia?", sub: "",
    options: [{ id: 3, label: "3 refeições" }, { id: 4, label: "4 refeições" }, { id: 5, label: "5 ou mais refeições" }],
  },
  {
    key: "restricoes_alimentares", title: "Você tem alguma restrição ou alergia alimentar?", sub: "A IA evita esses itens nas sugestões de dieta.",
    options: [
      { id: "nenhuma", label: "Nenhuma" }, { id: "lactose", label: "Lactose" }, { id: "gluten", label: "Glúten" },
      { id: "vegetariano", label: "Vegetariano" }, { id: "vegano", label: "Vegano" },
    ],
  },
  {
    key: "relacao_alimentacao", title: "Como é sua relação com a alimentação hoje?", sub: "",
    options: [
      { id: "como_de_tudo", label: "Como de tudo, sem muita preocupação" },
      { id: "evito_doces_frituras", label: "Tento evitar doces e frituras" },
      { id: "dieta_restrita", label: "Já sigo uma dieta restrita" },
    ],
  },
  {
    key: "consumo_agua", title: "Quanta água você costuma beber por dia hoje?", sub: "",
    options: [
      { id: "abaixo1_5", label: "Abaixo de 1,5L" }, { id: "2a3", label: "2L a 3L" }, { id: "mais3", label: "Mais de 3L" },
    ],
  },
  {
    key: "preferencia_cardapio", title: "Que tipo de cardápio você prefere?", sub: "",
    options: [
      { id: "tradicionais", label: "Tradicionais e fáceis de preparar" },
      { id: "variadas_fit", label: "Variadas / estilo fit" },
    ],
  },
];

function Onboarding({ onDone, saving, error }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ peso: 78, altura: 170 });
  const total = QUESTIONS.length + 1;

  const questionSteps = QUESTIONS.map((q) => ({
    title: q.title, sub: q.sub, valid: data[q.key] !== undefined && data[q.key] !== null,
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((op) => (
          <button key={op.id} onClick={() => setData((d) => ({ ...d, [q.key]: op.id }))} style={{
            padding: "14px 16px", borderRadius: 14, textAlign: "left", cursor: "pointer",
            border: `1.5px solid ${data[q.key] === op.id ? T.flame : T.line}`,
            background: data[q.key] === op.id ? hexToRgba(T.flame, 0.10) : T.surface,
            color: T.ink, fontFamily: "Inter",
          }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{op.label}</div>
            {op.sub && <div style={{ fontSize: 11.5, color: T.steel, marginTop: 3 }}>{op.sub}</div>}
          </button>
        ))}
      </div>
    ),
  }));

  const medidasStep = {
    title: "Peso e altura atuais", sub: "Usado para calcular macros, hidratação e volume de treino.",
    valid: !!data.peso && !!data.altura,
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 28, alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Inter", fontSize: 12, color: T.steel, marginBottom: 10 }}>PESO (KG)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
            <button onClick={() => setData((d) => ({ ...d, peso: Math.max(30, (d.peso || 78) - 1) }))} style={circleBtn()}><Minus size={16} /></button>
            <div style={{ fontFamily: "IBM Plex Mono", fontSize: 28, color: T.ink, minWidth: 90, textAlign: "center" }}>{data.peso || 78} kg</div>
            <button onClick={() => setData((d) => ({ ...d, peso: (d.peso || 78) + 1 }))} style={circleBtn(T.flame)}><Plus size={16} /></button>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Inter", fontSize: 12, color: T.steel, marginBottom: 10 }}>ALTURA (CM)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>
            <button onClick={() => setData((d) => ({ ...d, altura: Math.max(120, (d.altura || 170) - 1) }))} style={circleBtn()}><Minus size={16} /></button>
            <div style={{ fontFamily: "IBM Plex Mono", fontSize: 28, color: T.ink, minWidth: 90, textAlign: "center" }}>{data.altura || 170} cm</div>
            <button onClick={() => setData((d) => ({ ...d, altura: (d.altura || 170) + 1 }))} style={circleBtn(T.flame)}><Plus size={16} /></button>
          </div>
        </div>
      </div>
    ),
  };

  const steps = [...questionSteps, medidasStep];
  const cur = steps[step];
  const [direction, setDirection] = useState(1);
  function goNext() { setDirection(1); setStep((s) => s + 1); }
  function goBack() { setDirection(-1); setStep((s) => s - 1); }

  const stepVariants = {
    enter: (dir) => ({ x: dir > 0 ? 36 : -36, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -36 : 36, opacity: 0 }),
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: T.bg, color: T.ink, display: "flex", flexDirection: "column", fontFamily: "Inter", padding: "28px 20px 20px" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 28, flexWrap: "wrap" }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ flex: 1, minWidth: 12, height: 4, borderRadius: 999, background: i <= step ? T.flame : T.line, transition: "background .3s" }} />
        ))}
      </div>
      <div style={{ fontFamily: "Bebas Neue", fontSize: 12, letterSpacing: 2, color: T.volt, marginBottom: 6, textAlign: "center" }}>PASSO {step + 1} DE {total} · ONBOARDING</div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: step === total - 1 ? "center" : "flex-start" }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div key={step} custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <div style={{ fontFamily: "Bebas Neue", fontSize: 27, lineHeight: 1.15, marginBottom: 4, textAlign: "center" }}>{cur.title}</div>
            {cur.sub && <div style={{ color: T.steel, fontSize: 13, marginBottom: 20, textAlign: "center" }}>{cur.sub}</div>}
            {cur.body}
          </motion.div>
        </AnimatePresence>
      </div>
      <ErrorBox msg={error} />
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        {step > 0 && (
          <button onClick={goBack} style={{ width: 52, borderRadius: 14, border: `1.5px solid ${T.line}`, background: "transparent", color: T.steel, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ChevronLeft size={20} />
          </button>
        )}
        <button
          disabled={!cur.valid || saving}
          onClick={() => step === total - 1 ? onDone(data) : goNext()}
          style={{
            flex: 1, padding: "16px", borderRadius: 14, border: "none", cursor: cur.valid ? "pointer" : "not-allowed",
            background: cur.valid ? `linear-gradient(90deg, ${T.flame}, ${T.flame2})` : T.surface2,
            color: cur.valid ? "#1B0D06" : T.steelDim, fontFamily: "Bebas Neue", fontSize: 18, letterSpacing: 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
          {saving ? <Spinner size={18} color="#1B0D06" /> : <>{step === total - 1 ? "GERAR MEU TREINO" : "CONTINUAR"} <ArrowRight size={18} /></>}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   TREINO
   ============================================================ */
function TreinoTab({ plan, dayIndex, setDayIndex, onSwap, onFinish, profile, onGenerateAI, onShareWorkout, onSavePhoto, myCommunities }) {
  const [swapFor, setSwapFor] = useState(null);
  const [logging, setLogging] = useState(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState(null);
  const [cargas, setCargas] = useState({});
  const [showAI, setShowAI] = useState(false);
  const [lastFinished, setLastFinished] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [feitosPorDia, setFeitosPorDia] = useState({});
  const day = plan[dayIndex];
  const feitos = (day && feitosPorDia[day.id]) || new Set();

  function toggleFeito(exId) {
    setFeitosPorDia((prev) => {
      const cur = new Set(prev[day.id] || []);
      cur.has(exId) ? cur.delete(exId) : cur.add(exId);
      return { ...prev, [day.id]: cur };
    });
  }

  function openFinish(feedback) { setPendingFeedback(feedback); setCargas({}); setShowLoadModal(true); }

  async function confirmFinish() {
    setLogging(true);
    setShowLoadModal(false);
    const cargaRows = day.exercicios.filter((ex) => cargas[ex.id]).map((ex) => ({ nome: ex.nome, carga: Number(cargas[ex.id]), series: ex.series, reps: ex.reps }));
    await onFinish(dayIndex, pendingFeedback, cargaRows);
    setLogging(false);
    setLastFinished({ day, cargaRows });
    setShowPostModal(true);
  }

  if (!plan.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "60px 20px" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: hexToRgba(T.flame, 0.10), display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <Dumbbell size={32} color={T.flame} />
        </div>
        <div style={{ fontFamily: "Bebas Neue", fontSize: 22, color: T.ink, marginBottom: 8 }}>Você ainda não possui um treino</div>
        <div style={{ fontFamily: "Inter", fontSize: 13, color: T.steel, marginBottom: 26, maxWidth: 260, lineHeight: 1.5 }}>
          Deixe a IA forjar o seu primeiro plano!
        </div>
        <button onClick={() => setShowAI(true)} style={{
          width: "100%", maxWidth: 300, padding: 18, borderRadius: 16, border: "none", cursor: "pointer",
          background: `linear-gradient(90deg, ${T.flame}, ${T.flame2})`, color: "#1B0D06",
          fontFamily: "Bebas Neue", fontSize: 18, letterSpacing: 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}><Sparkles size={20} /> CRIAR TREINO COM IA</button>
        {showAI && <AIPlanSheet profile={profile} onClose={() => setShowAI(false)} onGenerate={onGenerateAI} />}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <button onClick={() => setShowAI(true)} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
          border: `1px solid ${T.flame}`, background: hexToRgba(T.flame, 0.10), color: T.flame2,
          fontFamily: "Inter", fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}><Sparkles size={13} /> Gerar treino com IA</button>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 4 }}>
        {plan.map((d, i) => <Pill key={d.id} active={i === dayIndex} onClick={() => setDayIndex(i)}>{d.nome.split("—")[0].trim()}</Pill>)}
      </div>

      <SectionTitle right={<span style={{ color: T.steel, fontSize: 12.5, fontFamily: "Inter", display: "flex", alignItems: "center", gap: 4 }}><Clock size={13} /> ~{30 + day.exercicios.length * 5} min</span>}>
        {day.nome}
      </SectionTitle>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {day.exercicios.map((ex) => {
          const feito = feitos.has(ex.id);
          return (
            <Card key={ex.id} style={{ display: "flex", alignItems: "center", gap: 10, opacity: feito ? 0.6 : 1 }}>
              <button onClick={() => toggleFeito(ex.id)} style={{
                flexShrink: 0, width: 24, height: 24, borderRadius: "50%", border: `2px solid ${feito ? T.volt : T.line}`,
                background: feito ? T.volt : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}>
                {feito && <Check size={13} color="#0E1013" />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 14, color: feito ? T.steelDim : T.ink, textDecoration: feito ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ex.nome}</div>
              </div>
              <div style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 8, background: T.surface2, whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: T.volt }}>{ex.series}×{ex.reps}</span>
              </div>
              <button onClick={() => setSwapFor(ex)} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surface2, color: T.steel, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Repeat size={15} />
              </button>
            </Card>
          );
        })}
      </div>

      <SectionTitle>Como foi o treino?</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <button disabled={logging} onClick={() => openFinish("facil")} style={feedbackBtnStyle(T.blue)}>Muito fácil</button>
        <button disabled={logging} onClick={() => openFinish("ideal")} style={feedbackBtnStyle(T.volt, true)}>Na medida</button>
        <button disabled={logging} onClick={() => openFinish("dificil")} style={feedbackBtnStyle(T.flame)}>Muito difícil</button>
      </div>
      <div style={{ color: T.steelDim, fontSize: 12, marginTop: 8, textAlign: "center", fontFamily: "Inter" }}>A IA recalibra séries da próxima sessão com base no seu feedback.</div>

      {showPostModal && lastFinished && (
        <PostWorkoutModal
          day={lastFinished.day} cargaRows={lastFinished.cargaRows} communities={myCommunities || []}
          onClose={() => setShowPostModal(false)}
          onShareToCommunity={({ day, cargaRows, file, communityId }) => onShareWorkout(day, cargaRows, file, communityId)}
          onSaveProgressOnly={({ day, cargaRows, file }) => onSavePhoto(day, cargaRows, file)}
        />
      )}

      {swapFor && (
        <Sheet onClose={() => setSwapFor(null)}>
          <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink, marginBottom: 4 }}>Trocar exercício</div>
          <div style={{ color: T.steel, fontSize: 12.5, marginBottom: 16 }}>Equivalentes para <b style={{ color: T.ink }}>{swapFor.nome}</b></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {altsFor(swapFor.nome).map((alt) => (
              <button key={alt} onClick={() => { onSwap(dayIndex, swapFor.id, alt); setSwapFor(null); }} style={{
                padding: 14, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink,
                textAlign: "left", fontFamily: "Inter", fontWeight: 600, fontSize: 13.5, cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>{alt} <ChevronRight size={15} color={T.steel} /></button>
            ))}
          </div>
        </Sheet>
      )}

      {showLoadModal && (
        <Sheet onClose={() => setShowLoadModal(false)}>
          <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink, marginBottom: 4 }}>Registrar carga (opcional)</div>
          <div style={{ color: T.steel, fontSize: 12.5, marginBottom: 16 }}>Preencha o peso usado para alimentar o gráfico de progressão.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "40vh", overflowY: "auto" }}>
            {day.exercicios.map((ex) => (
              <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0, fontFamily: "Inter", fontSize: 13, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ex.nome}</div>
                <input type="number" placeholder="kg" value={cargas[ex.id] || ""} onChange={(e) => setCargas((c) => ({ ...c, [ex.id]: e.target.value }))} style={{ flexShrink: 0, width: 70, padding: "8px 10px", borderRadius: 10, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "IBM Plex Mono", fontSize: 13 }} />
              </div>
            ))}
          </div>
          <button onClick={confirmFinish} style={{ marginTop: 18, width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: "pointer", background: T.flame, color: "#1B0D06", fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1 }}>SALVAR TREINO</button>
        </Sheet>
      )}

      {showAI && <AIPlanSheet profile={profile} onClose={() => setShowAI(false)} onGenerate={onGenerateAI} />}
    </div>
  );
}
function PostWorkoutModal({ day, cargaRows, communities, onClose, onShareToCommunity, onSaveProgressOnly }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(null); // 'share' | 'save' | null
  const [done, setDone] = useState(null); // 'shared' | 'saved'

  function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function shareToCommunity() {
    setLoading("share");
    try { await onShareToCommunity({ day, cargaRows, file, communityId: communities[0]?.id || null }); setDone("shared"); }
    finally { setLoading(null); }
  }
  async function saveOnly() {
    if (!file) return;
    setLoading("save");
    try { await onSaveProgressOnly({ day, cargaRows, file }); setDone("saved"); }
    finally { setLoading(null); }
  }

  // Passo 1: sem foto ainda — a interação é opcional, "Pular" fecha na hora
  if (!file && !done) {
    return (
      <Sheet onClose={onClose}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔥</div>
          <div style={{ fontFamily: "Bebas Neue", fontSize: 22, color: T.ink, marginBottom: 6 }}>Treino concluído!</div>
          <div style={{ color: T.steel, fontSize: 12.5, marginBottom: 22, lineHeight: 1.5 }}>Quer registrar uma foto do resultado de hoje?</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{
            padding: 15, borderRadius: 12, border: "none", cursor: "pointer",
            background: `linear-gradient(90deg, ${T.flame}, ${T.flame2})`, color: "#1B0D06", fontFamily: "Bebas Neue", fontSize: 15, letterSpacing: 0.5,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <Camera size={17} /> TIRAR FOTO DE PROGRESSO
            <input type="file" accept="image/*" capture="environment" onChange={pick} style={{ display: "none" }} />
          </label>
          <button onClick={onClose} style={{
            padding: 15, borderRadius: 12, border: `1px solid ${T.line}`, cursor: "pointer",
            background: "transparent", color: T.steel, fontFamily: "Inter", fontWeight: 700, fontSize: 13.5,
          }}>Pular</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink, marginBottom: 4 }}>Treino concluído 🔥</div>
      <div style={{ color: T.steel, fontSize: 12.5, marginBottom: 16 }}>O que você quer fazer com a foto?</div>

      {preview && (
        <div style={{ position: "relative", marginBottom: 14 }}>
          <img src={preview} alt="" style={{ width: "100%", borderRadius: 12, maxHeight: 240, objectFit: "cover" }} />
          <button onClick={() => { setFile(null); setPreview(null); }} style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={13} /></button>
        </div>
      )}

      {done ? (
        <div style={{ textAlign: "center", padding: "10px 0", color: T.volt, fontFamily: "Inter", fontWeight: 700, fontSize: 13 }}>
          {done === "shared" ? "Compartilhado na comunidade ✓" : "Salvo no seu progresso ✓"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {communities.length > 0 ? (
            <button disabled={!!loading} onClick={shareToCommunity} style={{
              padding: 14, borderRadius: 12, border: "none", cursor: loading ? "default" : "pointer",
              background: `linear-gradient(90deg, ${T.flame}, ${T.flame2})`, color: "#1B0D06", fontFamily: "Bebas Neue", fontSize: 15, letterSpacing: 0.5,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>{loading === "share" ? <Spinner size={15} color="#1B0D06" /> : <><Share2 size={15} /> COMPARTILHAR NA COMUNIDADE</>}</button>
          ) : (
            <div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.steelDim, textAlign: "center", marginBottom: 2 }}>Entre em uma comunidade pra poder compartilhar treinos.</div>
          )}
          <button disabled={!!loading || !file} onClick={saveOnly} style={{
            padding: 14, borderRadius: 12, border: `1px solid ${T.line}`, cursor: (loading || !file) ? "default" : "pointer",
            background: T.surface2, color: file ? T.ink : T.steelDim, fontFamily: "Bebas Neue", fontSize: 15, letterSpacing: 0.5,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>{loading === "save" ? <Spinner size={15} color={T.ink} /> : "SALVAR APENAS NO MEU PROGRESSO"}</button>
        </div>
      )}
    </Sheet>
  );
}

function AIPlanSheet({ profile, onClose, onGenerate }) {
  const [params, setParams] = useState({
    nivel_experiencia: profile.nivel_experiencia, objetivo_principal: profile.objetivo_principal,
    dias_semana: profile.dias_semana, tempo_categoria: profile.tempo_categoria,
    equipamento: profile.equipamento, lesao_regiao: profile.lesao_regiao, foco_muscular: profile.foco_muscular,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  function field(key, label, options) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "Inter", fontSize: 11, color: T.steel, marginBottom: 6, fontWeight: 700, letterSpacing: 0.3 }}>{label}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {options.map((op) => (
            <button key={op.id} onClick={() => setParams((p) => ({ ...p, [key]: op.id }))} style={{
              padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontFamily: "Inter", fontWeight: 600,
              border: `1.5px solid ${params[key] === op.id ? T.flame : T.line}`,
              background: params[key] === op.id ? hexToRgba(T.flame, 0.10) : T.surface2, color: T.ink,
            }}>{op.label}</button>
          ))}
        </div>
      </div>
    );
  }

  async function submit() {
    setLoading(true); setErr("");
    try { await onGenerate(params); onClose(); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Sheet onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Sparkles size={18} color={T.flame} />
        <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink }}>Gerar treino com IA</div>
      </div>
      <div style={{ color: T.steel, fontSize: 12.5, marginBottom: 16 }}>Ajuste os parâmetros e a IA monta um plano novo do zero.</div>
      <div style={{ maxHeight: "48vh", overflowY: "auto" }}>
        {field("nivel_experiencia", "NÍVEL", [{ id: "iniciante", label: "Iniciante" }, { id: "intermediario", label: "Intermediário" }, { id: "avancado", label: "Avançado" }])}
        {field("objetivo_principal", "OBJETIVO", [{ id: "hipertrofia", label: "Hipertrofia" }, { id: "emagrecimento", label: "Emagrecimento" }, { id: "condicionamento", label: "Condicionamento" }, { id: "forca", label: "Força" }])}
        {field("dias_semana", "DIAS/SEMANA", [{ id: 2, label: "2" }, { id: 3, label: "3" }, { id: 4, label: "4" }, { id: 5, label: "5+" }])}
        {field("tempo_categoria", "TEMPO", [{ id: "ate30", label: "Até 30min" }, { id: "45a60", label: "45–60min" }, { id: "1ha1h30", label: "1h–1h30" }, { id: "mais1h30", label: "+1h30" }])}
        {field("equipamento", "EQUIPAMENTO", [{ id: "completa", label: "Completa" }, { id: "basica", label: "Condomínio" }, { id: "casa", label: "Casa" }])}
        {field("lesao_regiao", "RESTRIÇÃO", [{ id: "nenhuma", label: "Nenhuma" }, { id: "joelhos", label: "Joelhos" }, { id: "lombar", label: "Lombar" }, { id: "ombros_punhos", label: "Ombros/punhos" }, { id: "outra", label: "Outra" }])}
        {field("foco_muscular", "FOCO", [{ id: "corpo_inteiro", label: "Corpo inteiro" }, { id: "superior", label: "Superior" }, { id: "inferior", label: "Inferior" }, { id: "core", label: "Core" }])}
      </div>
      <ErrorBox msg={err} />
      <button disabled={loading} onClick={submit} style={{
        marginTop: 10, width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: loading ? "default" : "pointer",
        background: `linear-gradient(90deg, ${T.flame}, ${T.flame2})`, color: "#1B0D06", fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {loading ? <><Spinner size={16} color="#1B0D06" /> Gerando com IA...</> : <>GERAR TREINO</>}
      </button>
    </Sheet>
  );
}
function feedbackBtnStyle(color, filled) {
  return { padding: "14px 4px", borderRadius: 12, cursor: "pointer", fontFamily: "Inter", fontWeight: 700, fontSize: 12.5, border: `1.5px solid ${color}`, background: filled ? color : "transparent", color: filled ? "#0E1013" : color };
}

/* ============================================================
   PROGRESSO
   ============================================================ */
function ProgressoTab({ exerciseLogs, bodyLogs, workoutLogs, weekMeals, metaKcal, onAddBodyLog }) {
  const exerciseNames = useMemo(() => [...new Set(exerciseLogs.map((l) => l.exercicio))], [exerciseLogs]);
  const [exSel, setExSel] = useState(exerciseNames[0] || null);
  useEffect(() => { if (!exSel && exerciseNames.length) setExSel(exerciseNames[0]); }, [exerciseNames, exSel]);

  const chartData = useMemo(() => {
    if (!exSel) return [];
    return exerciseLogs.filter((l) => l.exercicio === exSel).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((l) => ({ data: new Date(l.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), carga: l.carga }));
  }, [exerciseLogs, exSel]);

  const volumeGrupo = useMemo(() => {
    const since = Date.now() - 7 * 86400000;
    const acc = {};
    exerciseLogs.filter((l) => new Date(l.created_at).getTime() >= since).forEach((l) => {
      const g = NAME_TO_GROUP[l.exercicio] || "outro";
      acc[g] = (acc[g] || 0) + (l.series || 0);
    });
    return Object.entries(acc).map(([grupo, series]) => ({ grupo: GROUP_LABEL[grupo] || grupo, series }));
  }, [exerciseLogs]);

  const bodyChart = useMemo(() => [...bodyLogs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((b) => ({ data: new Date(b.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), peso: b.peso, gordura: b.gordura })), [bodyLogs]);

  const adherence = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const kcal = weekMeals.filter((m) => m.created_at.slice(0, 10) === key).reduce((s, m) => s + m.kcal, 0);
      const hit = metaKcal > 0 && kcal >= metaKcal * 0.85 && kcal <= metaKcal * 1.15;
      days.push({ data: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), kcal: Math.round(kcal), hit });
    }
    return days;
  }, [weekMeals, metaKcal]);
  const diasNaMeta = adherence.filter((d) => d.hit).length;

  const [novoPeso, setNovoPeso] = useState("");
  const [novaGordura, setNovaGordura] = useState("");
  const [showBodyForm, setShowBodyForm] = useState(false);
  const trainedDays = useMemo(() => new Set(workoutLogs.map((l) => l.created_at.slice(0, 10))), [workoutLogs]);

  return (
    <div>
      <SectionTitle>Progressão de carga</SectionTitle>
      {exerciseNames.length === 0 ? <EmptyState text="Nenhum registro de carga ainda. Marque um treino como concluído e informe o peso usado para ver o gráfico aqui." /> : (
        <>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
            {exerciseNames.map((k) => <Pill key={k} active={exSel === k} onClick={() => setExSel(k)}>{k.split("(")[0].trim()}</Pill>)}
          </div>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div style={{ fontFamily: "Inter", color: T.steel, fontSize: 12 }}>Última carga registrada</div>
              <div style={{ fontFamily: "Bebas Neue", fontSize: 26, color: T.volt }}>{chartData[chartData.length - 1]?.carga ?? "—"} kg</div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="data" stroke={T.steelDim} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={T.steelDim} fontSize={11} tickLine={false} axisLine={false} domain={["dataMin - 5", "dataMax + 5"]} />
                <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, fontFamily: "Inter", fontSize: 12 }} labelStyle={{ color: T.steel }} />
                <Line type="monotone" dataKey="carga" stroke={T.flame} strokeWidth={3} dot={{ r: 3, fill: T.flame }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      <SectionTitle>Volume semanal por grupo muscular</SectionTitle>
      {volumeGrupo.length === 0 ? <EmptyState text="Sem séries registradas nos últimos 7 dias." /> : (
        <Card>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={volumeGrupo}>
              <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="grupo" stroke={T.steelDim} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={T.steelDim} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, fontFamily: "Inter", fontSize: 12 }} labelStyle={{ color: T.steel }} />
              <Bar dataKey="series" radius={[6, 6, 0, 0]}>
                {volumeGrupo.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? T.volt : T.flame} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ color: T.steelDim, fontSize: 11.5, fontFamily: "Inter", marginTop: 4 }}>séries totais nos últimos 7 dias</div>
        </Card>
      )}

      <SectionTitle right={<span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: T.steel }}>{diasNaMeta}/7 dias na meta</span>}>Aderência à dieta</SectionTitle>
      <Card>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={adherence}>
            <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="data" stroke={T.steelDim} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke={T.steelDim} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, fontFamily: "Inter", fontSize: 12 }} labelStyle={{ color: T.steel }} formatter={(v) => [`${v} kcal`, "consumido"]} />
            {metaKcal > 0 && <ReferenceLine y={metaKcal} stroke={T.steel} strokeDasharray="4 3" label={{ value: "meta", fill: T.steel, fontSize: 10, position: "insideTopRight" }} />}
            <Bar dataKey="kcal" radius={[6, 6, 0, 0]}>
              {adherence.map((d, i) => <Cell key={i} fill={d.hit ? T.volt : T.flame} opacity={d.kcal === 0 ? 0.25 : 1} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ color: T.steelDim, fontSize: 11.5, fontFamily: "Inter", marginTop: 4 }}>calorias consumidas por dia vs. meta ({metaKcal} kcal)</div>
      </Card>

      <SectionTitle right={<button onClick={() => setShowBodyForm(true)} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: T.flame, color: "#1B0D06", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Plus size={17} /></button>}>Composição corporal</SectionTitle>
      {bodyChart.length === 0 ? <EmptyState text="Adicione seu primeiro registro de peso para começar a ver a tendência." /> : (
        <Card>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={bodyChart}>
              <CartesianGrid stroke={T.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="data" stroke={T.steelDim} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={T.steelDim} fontSize={11} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, fontFamily: "Inter", fontSize: 12 }} labelStyle={{ color: T.steel }} />
              <Line type="monotone" dataKey="peso" stroke={T.blue} strokeWidth={3} dot={false} name="Peso (kg)" />
              <Line type="monotone" dataKey="gordura" stroke={T.flame2} strokeWidth={2} dot={false} strokeDasharray="4 3" name="% Gordura" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontFamily: "Inter", fontSize: 11.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: T.steel }}><span style={{ width: 10, height: 3, background: T.blue, display: "inline-block", borderRadius: 2 }} /> peso (kg)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: T.steel }}><span style={{ width: 10, height: 3, background: T.flame2, display: "inline-block", borderRadius: 2 }} /> % gordura</div>
          </div>
        </Card>
      )}

      <SectionTitle>Histórico de treinos</SectionTitle>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {Array.from({ length: 35 }).map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (34 - i));
            const trained = trainedDays.has(d.toISOString().slice(0, 10));
            return <div key={i} style={{ aspectRatio: "1", borderRadius: 6, background: trained ? T.volt : T.surface2, opacity: trained ? 0.9 : 1 }} />;
          })}
        </div>
        <div style={{ color: T.steelDim, fontSize: 11.5, fontFamily: "Inter", marginTop: 8 }}>últimas 5 semanas</div>
      </Card>

      {showBodyForm && (
        <Sheet onClose={() => setShowBodyForm(false)}>
          <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink, marginBottom: 16 }}>Novo registro corporal</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <LabeledNumber label="PESO (KG)" value={novoPeso} onChange={setNovoPeso} />
            <LabeledNumber label="% GORDURA (opcional)" value={novaGordura} onChange={setNovaGordura} />
          </div>
          <button onClick={async () => { if (!novoPeso) return; await onAddBodyLog(Number(novoPeso), novaGordura ? Number(novaGordura) : null); setNovoPeso(""); setNovaGordura(""); setShowBodyForm(false); }} style={{ marginTop: 18, width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: "pointer", background: T.flame, color: "#1B0D06", fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1 }}>SALVAR</button>
        </Sheet>
      )}
    </div>
  );
}
function LabeledNumber({ label, value, onChange }) {
  return (
    <div>
      <div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.steel, marginBottom: 6 }}>{label}</div>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "IBM Plex Mono", fontSize: 15 }} />
    </div>
  );
}

/* ============================================================
   DIETA — cronograma por horário
   ============================================================ */
function MealRow({ meal, onRemove, onQtyChange, onQtySet }) {
  const canAdjust = meal.base_kcal != null && !!meal.unit_type;
  const isGram = meal.unit_type === "gram";
  const [localQtd, setLocalQtd] = useState(meal.qtd);
  useEffect(() => { setLocalQtd(meal.qtd); }, [meal.qtd]);

  function commit() {
    const n = Number(localQtd);
    if (!isNaN(n) && n > 0 && n !== meal.qtd) onQtySet(meal, n);
    else setLocalQtd(meal.qtd);
  }

  // preview instantâneo: recalcula kcal com base na quantidade digitada
  // antes mesmo de confirmar (proporção qtd/porcaoBase × valorBase)
  const previewFactor = canAdjust && isGram ? (Number(localQtd) || 0) / 100 : null;
  const previewKcal = previewFactor != null ? meal.base_kcal * previewFactor : meal.kcal;

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: T.surface2, borderRadius: 10, gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meal.nome}</div>
      </div>
      {canAdjust && isGram && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="number" value={localQtd} onChange={(e) => setLocalQtd(e.target.value)}
            onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
            style={{ width: 50, padding: "3px 5px", borderRadius: 6, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontFamily: "IBM Plex Mono", fontSize: 11, textAlign: "center" }}
          />
          <span style={{ fontFamily: "Inter", fontSize: 10, color: T.steelDim }}>g</span>
        </div>
      )}
      {canAdjust && !isGram && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => onQtyChange(meal, -1)} style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${T.line}`, background: "transparent", color: T.steel, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Minus size={11} /></button>
          <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: T.ink, minWidth: 14, textAlign: "center" }}>{meal.qtd}</span>
          <button onClick={() => onQtyChange(meal, 1)} style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${T.line}`, background: "transparent", color: T.steel, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Plus size={11} /></button>
        </div>
      )}
      <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: T.steel, minWidth: 52, textAlign: "right" }}>{Math.round(previewKcal)} kcal</span>
      <button onClick={() => onRemove(meal.id)} style={{ background: "none", border: "none", color: T.steelDim, cursor: "pointer", display: "flex", flexShrink: 0 }}><X size={13} /></button>
    </div>
  );
}
function DietaTab({ peso, objetivoPrincipal, nivelAtividade, dietaTipo, meals, waterMl, onAddMeal, onRemoveMeal, onUpdateMealQty, onSetMealQty, onAddWater, onRemoveWater, aiSuggestions, onUseSuggestion, onGenerateDietAI }) {
  const macros = useMemo(() => calcMacros(peso, objetivoPrincipal, nivelAtividade), [peso, objetivoPrincipal, nivelAtividade]);
  const [search, setSearch] = useState("");
  const [addSlot, setAddSlot] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  const metaAgua = Math.round(peso * 35);
  const nowMin = useMemo(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }, []);

  const consumed = meals.reduce((acc, r) => ({ kcal: acc.kcal + r.kcal, p: acc.p + r.proteina, c: acc.c + r.carbo, g: acc.g + r.gordura }), { kcal: 0, p: 0, c: 0, g: 0 });
  const baseFoods = dietaTipo === "vegetariana" ? FOOD_DB.filter((f) => f.veg !== false) : FOOD_DB;
  const filtered = baseFoods.filter((f) => f.nome.toLowerCase().includes(search.toLowerCase()));

  const mealsBySlot = (slotId) => meals.filter((m) => m.horario_slot === slotId);
  const outras = meals.filter((m) => !MEAL_SLOTS.some((s) => s.id === m.horario_slot));

  const STATUS_META = {
    agora: { label: "AGORA", color: T.flame },
    a_seguir: { label: "A SEGUIR", color: T.steelDim },
    concluida: { label: "CONCLUÍDA", color: T.volt },
    pendente: { label: "PENDENTE", color: T.red },
  };

  const [showFlexSheet, setShowFlexSheet] = useState(false);

  async function handleGenerate(alimentoDesejado) {
    setGenLoading(true);
    try { await onGenerateDietAI(alimentoDesejado); } catch (e) { /* erro já tratado no App */ }
    finally { setGenLoading(false); setShowFlexSheet(false); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button disabled={genLoading} onClick={() => setShowFlexSheet(true)} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
          border: `1px solid ${T.flame}`, background: hexToRgba(T.flame, 0.10), color: T.flame2,
          fontFamily: "Inter", fontWeight: 700, fontSize: 12, cursor: genLoading ? "default" : "pointer",
        }}>
          {genLoading ? <Spinner size={13} color={T.flame2} /> : <Sparkles size={13} />}
          {aiSuggestions && aiSuggestions.length ? "Atualizar dieta com IA" : "Gerar dieta com IA"}
        </button>
      </div>

      <SectionTitle>Metas diárias — {OBJ_PRINCIPAL_LABEL[objetivoPrincipal]}</SectionTitle>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: "Inter", color: T.steel, fontSize: 12 }}>Calorias</div>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 13, color: T.ink }}><b style={{ color: T.volt, fontFamily: "Bebas Neue", fontSize: 18 }}>{Math.round(consumed.kcal)}</b> / {macros.kcal} kcal</div>
        </div>
        <div style={{ marginTop: 6 }}><ProgressBar pct={(consumed.kcal / macros.kcal) * 100} color={T.volt} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 18 }}>
          {[["Proteína", consumed.p, macros.p, T.flame], ["Carbo", consumed.c, macros.c, T.blue], ["Gordura", consumed.g, macros.g, T.flame2]].map(([label, cons, meta, color]) => (
            <div key={label}>
              <div style={{ fontFamily: "Inter", fontSize: 11, color: T.steel, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12.5, color: T.ink, marginBottom: 6 }}>{Math.round(cons)}g <span style={{ color: T.steelDim }}>/ {meta}g</span></div>
              <ProgressBar pct={(cons / meta) * 100} color={color} />
            </div>
          ))}
        </div>
      </Card>

      <SectionTitle>Cronograma de refeições</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {MEAL_SLOTS.map((slot) => {
          const status = slotStatus(slot, nowMin);
          const slotMeals = mealsBySlot(slot.id);
          const finalStatus = status === "passada" ? (slotMeals.length > 0 ? "concluida" : "pendente") : status;
          const meta = STATUS_META[finalStatus];
          return (
            <Card key={slot.id} style={{ border: `1.5px solid ${finalStatus === "agora" ? T.flame : T.line}`, background: finalStatus === "agora" ? hexToRgba(T.flame, 0.08) : T.surface }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 14, color: T.ink }}>{slot.label}</div>
                  <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11.5, color: T.steel }}>{slot.hora}</div>
                </div>
                <span style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 10.5, color: meta.color, letterSpacing: 0.5 }}>{meta.label}</span>
              </div>
              {slotMeals.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {slotMeals.map((m) => <MealRow key={m.id} meal={m} onRemove={onRemoveMeal} onQtyChange={onUpdateMealQty} onQtySet={onSetMealQty} />)}
                </div>
              )}
              {(() => {
                const sug = (aiSuggestions || []).find((s) => s.slot === slot.id);
                if (!sug) return null;
                return (
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: hexToRgba(T.volt, 0.06), border: `1px dashed ${T.volt}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                      <Sparkles size={11} color={T.volt} />
                      <span style={{ fontFamily: "Inter", fontSize: 10, fontWeight: 700, color: T.volt, letterSpacing: 0.4 }}>SUGESTÃO DA IA</span>
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12.5, color: T.ink, marginBottom: 6 }}>{sug.sugestao}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: T.steel }}>{Math.round(sug.kcal)} kcal · P{Math.round(sug.proteina)} C{Math.round(sug.carboidrato)} G{Math.round(sug.gordura)}</span>
                      <button onClick={() => onUseSuggestion(sug, slot.id)} style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${T.volt}`, background: "transparent", color: T.volt, fontFamily: "Inter", fontWeight: 700, fontSize: 10.5, cursor: "pointer" }}>Usar</button>
                    </div>
                  </div>
                );
              })()}
              <button onClick={() => setAddSlot(slot)} style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 10, border: `1px dashed ${T.line}`, background: "transparent", color: T.steel, fontFamily: "Inter", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Plus size={13} /> Adicionar alimento
              </button>
            </Card>
          );
        })}
        {outras.length > 0 && (
          <Card>
            <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 8 }}>Outras refeições</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {outras.map((m) => <MealRow key={m.id} meal={m} onRemove={onRemoveMeal} onQtyChange={onUpdateMealQty} onQtySet={onSetMealQty} />)}
            </div>
          </Card>
        )}
      </div>

      <SectionTitle>Hidratação</SectionTitle>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "Bebas Neue", fontSize: 26, color: T.blue }}>{waterMl} ml</div>
            <div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.steel }}>meta: {metaAgua} ml (35ml/kg)</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onRemoveWater} style={circleBtn()}><Minus size={16} /></button>
            <div style={{ fontFamily: "IBM Plex Mono", fontSize: 16, color: T.ink, minWidth: 30, textAlign: "center" }}>{Math.round(waterMl / 250)}</div>
            <button onClick={onAddWater} style={circleBtn(T.blue)}><Plus size={16} /></button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}><ProgressBar pct={(waterMl / metaAgua) * 100} color={T.blue} /></div>
      </Card>

      {addSlot && (
        <AddFoodSheet
          slot={addSlot}
          search={search}
          setSearch={setSearch}
          filtered={filtered}
          onClose={() => { setAddSlot(null); setSearch(""); }}
          onPick={(f) => { onAddMeal(f, addSlot.id); setAddSlot(null); setSearch(""); }}
        />
      )}

      {showFlexSheet && <FlexDietSheet loading={genLoading} onClose={() => setShowFlexSheet(false)} onGenerate={handleGenerate} />}
    </div>
  );
}

function FlexDietSheet({ loading, onClose, onGenerate }) {
  const [alimento, setAlimento] = useState("");
  return (
    <Sheet onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Sparkles size={18} color={T.flame} />
        <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink }}>Gerar dieta com IA</div>
      </div>
      <div style={{ color: T.steel, fontSize: 12.5, marginBottom: 16, lineHeight: 1.4 }}>
        Deseja encaixar algum alimento específico na sua dieta hoje? A IA vai calcular os macros pra encaixá-lo sem estourar suas calorias.
      </div>
      <input
        value={alimento} onChange={(e) => setAlimento(e.target.value)}
        placeholder="Ex: Um sonho de padaria (opcional)"
        style={{ width: "100%", padding: 14, borderRadius: 12, border: `1.5px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontSize: 13.5, marginBottom: 16 }}
      />
      <button disabled={loading} onClick={() => onGenerate(alimento.trim())} style={{
        width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: loading ? "default" : "pointer",
        background: `linear-gradient(90deg, ${T.flame}, ${T.flame2})`, color: "#1B0D06",
        fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {loading ? <><Spinner size={16} color="#1B0D06" /> Gerando...</> : "GERAR"}
      </button>
    </Sheet>
  );
}

function AddFoodSheet({ slot, search, setSearch, filtered, onClose, onPick }) {
  const [mode, setMode] = useState("buscar"); // buscar | customizado
  const [nome, setNome] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [g, setG] = useState("");
  const valid = nome.trim() && kcal !== "";

  function submitCustom() {
    if (!valid) return;
    onPick({
      id: `custom-${Date.now()}`, nome: nome.trim(), unidade: "porção",
      kcal: Number(kcal) || 0, p: Number(p) || 0, c: Number(c) || 0, g: Number(g) || 0,
    });
  }

  return (
    <Sheet onClose={onClose}>
      <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink, marginBottom: 4 }}>Adicionar alimento</div>
      <div style={{ color: T.steel, fontSize: 12.5, marginBottom: 12 }}>{slot.label} · {slot.hora}</div>

      <div style={{ display: "flex", background: T.surface2, borderRadius: 10, padding: 3, marginBottom: 14, border: `1px solid ${T.line}` }}>
        {[["buscar", "Buscar alimento"], ["customizado", "Customizado"]].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer",
            background: mode === m ? T.flame : "transparent", color: mode === m ? "#1B0D06" : T.steel,
            fontFamily: "Inter", fontWeight: 700, fontSize: 12.5,
          }}>{label}</button>
        ))}
      </div>

      {mode === "buscar" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface2, borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
            <Search size={15} color={T.steel} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar alimento..." style={{ background: "transparent", border: "none", outline: "none", color: T.ink, fontFamily: "Inter", fontSize: 13.5, flex: 1 }} />
            <Barcode size={16} color={T.steelDim} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "42vh", overflowY: "auto" }}>
            {filtered.map((f) => (
              <button key={f.id} onClick={() => onPick(f)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface2, cursor: "pointer", textAlign: "left" }}>
                <div>
                  <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 13.5, color: T.ink }}>{f.nome}</div>
                  <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: T.steel }}>{f.unidade} · {f.kcal} kcal</div>
                </div>
                <Plus size={16} color={T.volt} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "Inter", fontSize: 11, color: T.steel, marginBottom: 6, fontWeight: 700 }}>NOME DO ALIMENTO</div>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Marmita caseira" style={{ width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontSize: 13.5 }} />
          </div>
          <div style={{ color: T.steelDim, fontSize: 11, marginBottom: 10 }}>Informe os valores para a porção que você vai registrar agora.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
            <LabeledNumber label="KCAL" value={kcal} onChange={setKcal} />
            <LabeledNumber label="PROTEÍNA (G)" value={p} onChange={setP} />
            <LabeledNumber label="CARBOIDRATO (G)" value={c} onChange={setC} />
            <LabeledNumber label="GORDURA (G)" value={g} onChange={setG} />
          </div>
          <button disabled={!valid} onClick={submitCustom} style={{
            marginTop: 14, width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: valid ? "pointer" : "not-allowed",
            background: valid ? `linear-gradient(90deg, ${T.flame}, ${T.flame2})` : T.surface2, color: valid ? "#1B0D06" : T.steelDim,
            fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1,
          }}>ADICIONAR</button>
        </div>
      )}
    </Sheet>
  );
}

/* ============================================================
   COMUNIDADE — feed social (posts, curtidas, comentários) + chat
   ============================================================ */
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function PostCard({ post, author, liked, likeCount, comments, currentUserId, onToggleLike, onAddComment, onOpenProfile, commentAuthors, communityName, following, onToggleFollow, onRepost, onDelete }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isRepost = !!post.reposted_from;
  const content = isRepost ? post.meta?.original_content : post.content;
  const imageUrl = isRepost ? post.meta?.original_image_url : post.image_url;
  const headerAuthor = isRepost
    ? { id: post.meta?.original_author_id, nome: post.meta?.original_author_nome, avatar_url: post.meta?.original_author_avatar }
    : author;
  const longText = content && content.length > 220;
  const isMine = post.user_id === currentUserId;

  return (
    <Card style={{ padding: 14, borderRadius: 18 }}>
      {isRepost && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, color: T.steel, fontFamily: "Inter", fontSize: 11.5, fontWeight: 700 }}>
          <Repeat size={13} /> {author.nome || "Atleta"} republicou
        </div>
      )}
      <div style={isRepost ? { borderLeft: `2.5px solid ${T.flame}`, paddingLeft: 12 } : undefined}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button onClick={() => onOpenProfile(headerAuthor)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {headerAuthor.avatar_url ? (
              <img src={headerAuthor.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><User size={16} color={T.steelDim} /></div>
            )}
            <div style={{ textAlign: "left", minWidth: 0 }}>
              <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 13, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{headerAuthor.nome || "Atleta"}</div>
              <div style={{ fontFamily: "Inter", fontSize: 10.5, color: T.steelDim, display: "flex", alignItems: "center", gap: 4 }}>
                <span>há {timeAgo(post.created_at)}</span>
                {communityName && <><span>·</span><span>{communityName}</span></>}
              </div>
            </div>
          </button>
          {!isRepost && headerAuthor.id !== currentUserId && onToggleFollow && (
            <button onClick={() => onToggleFollow(headerAuthor)} style={{
              marginLeft: "auto", padding: "5px 10px", borderRadius: 999, border: `1px solid ${following ? T.line : T.flame}`,
              background: following ? "transparent" : hexToRgba(T.flame, 0.10), color: following ? T.steel : T.flame2,
              fontFamily: "Inter", fontWeight: 700, fontSize: 10.5, cursor: "pointer", flexShrink: 0,
            }}>{following ? "Seguindo" : "Seguir"}</button>
          )}
          {post.type === "treino" && (
            <span style={{ marginLeft: (!isRepost && onToggleFollow) ? 6 : "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: hexToRgba(T.flame, 0.10) }}>
              <Flame size={11} color={T.flame} /><span style={{ fontFamily: "Inter", fontSize: 10, fontWeight: 700, color: T.flame2 }}>TREINO</span>
            </span>
          )}
          {isMine && onDelete && (
            <button onClick={() => setShowMenu(true)} style={{ marginLeft: post.type !== "treino" ? "auto" : 4, background: "none", border: "none", color: T.steelDim, cursor: "pointer", flexShrink: 0, padding: 4 }}>
              <MoreHorizontal size={17} />
            </button>
          )}
        </div>

        {content && (
          <div style={{ fontFamily: "Inter", fontSize: 13.5, color: T.ink, marginBottom: imageUrl ? 10 : 4, lineHeight: 1.5 }}>
            {longText && !expanded ? content.slice(0, 220) + "… " : content}
            {longText && (
              <button onClick={() => setExpanded((e) => !e)} style={{ background: "none", border: "none", color: T.steel, fontFamily: "Inter", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}>
                {expanded ? " ver menos" : "ver mais"}
              </button>
            )}
          </div>
        )}
        {imageUrl && <img src={imageUrl} alt="" style={{ width: "100%", aspectRatio: "4/5", borderRadius: 14, marginBottom: 8, display: "block", objectFit: "cover" }} />}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 8 }}>
        <button onClick={() => onToggleLike(post)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: liked ? T.flame : T.steel }}>
          <Heart size={17} fill={liked ? T.flame : "none"} />
          <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12 }}>{likeCount}</span>
        </button>
        <button onClick={() => setShowComments(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: T.steel }}>
          <MessageSquare size={16} />
          <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12 }}>{comments.length}</span>
        </button>
        {onRepost && (
          <button onClick={() => onRepost(post)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: T.steel, marginLeft: "auto" }}>
            <Repeat size={16} />
          </button>
        )}
      </div>

      {showComments && (
        <Sheet onClose={() => setShowComments(false)}>
          <div style={{ fontFamily: "Bebas Neue", fontSize: 18, color: T.ink, marginBottom: 14 }}>Comentários</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "45vh", overflowY: "auto", marginBottom: 14 }}>
            {comments.length === 0 && <div style={{ fontFamily: "Inter", fontSize: 12.5, color: T.steelDim, textAlign: "center", padding: "10px 0" }}>Nenhum comentário ainda.</div>}
            {comments.map((c) => {
              const ca = commentAuthors[c.user_id] || {};
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  {ca.avatar_url ? <img src={ca.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.surface2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><User size={12} color={T.steelDim} /></div>}
                  <div style={{ background: T.surface2, borderRadius: 12, padding: "7px 11px", flex: 1 }}>
                    <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 11.5, color: T.steel, marginBottom: 2 }}>{ca.nome || "Atleta"}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 12.5, color: T.ink }}>{c.content}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Comente..." style={{ flex: 1, padding: "10px 14px", borderRadius: 999, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontSize: 13 }} />
            <button onClick={() => { if (commentText.trim()) { onAddComment(post, commentText.trim()); setCommentText(""); } }} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.flame, color: "#1B0D06", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <Send size={15} />
            </button>
          </div>
        </Sheet>
      )}

      {showMenu && (
        <Sheet onClose={() => setShowMenu(false)}>
          <button onClick={() => { onDelete(post); setShowMenu(false); }} style={{
            width: "100%", padding: 14, borderRadius: 12, border: `1px solid ${T.red}`, background: hexToRgba(T.red, 0.08),
            color: T.red, fontFamily: "Inter", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "left",
            display: "flex", alignItems: "center", gap: 8,
          }}><Trash2 size={15} /> Excluir postagem</button>
        </Sheet>
      )}
    </Card>
  );
}

function ExploreScreen({ userId, token, myProfile, onOpenMessages, onOpenProfile, hasUnreadDM }) {
  const [subTab, setSubTab] = useState("paravoce"); // seguindo | paravoce
  const [posts, setPosts] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [communitiesById, setCommunitiesById] = useState({});
  const [likesByPost, setLikesByPost] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [followingIds, setFollowingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const PAGE_SIZE = 10;
  const sentinelRef = React.useRef(null);
  const offsetRef = React.useRef(0);

  const enrichAndAppend = useCallback(async (newPosts, replace) => {
    const uids = [...new Set(newPosts.map((p) => p.user_id))];
    if (uids.length) {
      const profs = await sbSelect("public_profiles", token, `id=in.(${uids.join(",")})&select=*`);
      setProfilesById((prev) => ({ ...prev, ...Object.fromEntries(profs.map((pr) => [pr.id, pr])) }));
    }
    const cids = [...new Set(newPosts.map((p) => p.community_id).filter(Boolean))];
    if (cids.length) {
      const comms = await sbSelect("communities", token, `id=in.(${cids.join(",")})&select=id,nome`);
      setCommunitiesById((prev) => ({ ...prev, ...Object.fromEntries(comms.map((c) => [c.id, c.nome])) }));
    }
    if (newPosts.length) {
      const ids = newPosts.map((p) => p.id).join(",");
      const [l, c] = await Promise.all([
        sbSelect("likes", token, `post_id=in.(${ids})&select=*`),
        sbSelect("comments", token, `post_id=in.(${ids})&select=*&order=created_at.asc`),
      ]);
      setLikesByPost((prev) => { const next = replace ? {} : { ...prev }; l.forEach((x) => { (next[x.post_id] ||= new Set()).add(x.user_id); }); return next; });
      setCommentsByPost((prev) => { const next = replace ? {} : { ...prev }; c.forEach((x) => { (next[x.post_id] ||= []).push(x); }); return next; });
    }
    setPosts((prev) => replace ? newPosts : [...prev, ...newPosts]);
  }, [token]);

  const loadPage = useCallback(async (isFirst) => {
    if (isFirst) setLoading(true); else setLoadingMore(true);
    try {
      const from = isFirst ? 0 : offsetRef.current;
      let query = `community_id=is.null&select=*&order=created_at.desc&limit=${PAGE_SIZE}&offset=${from}`;
      if (subTab === "seguindo") {
        const followed = await sbSelect("follows", token, `follower_id=eq.${userId}&select=following_id`);
        const ids = followed.map((f) => f.following_id);
        setFollowingIds(new Set(ids));
        if (!ids.length) { setPosts([]); setHasMore(false); return; }
        query = `community_id=is.null&user_id=in.(${ids.join(",")})&select=*&order=created_at.desc&limit=${PAGE_SIZE}&offset=${from}`;
      }
      const rows = await sbSelect("posts", token, query);
      await enrichAndAppend(rows, isFirst);
      offsetRef.current = from + rows.length;
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) { /* mantém o que já tem */ }
    finally { setLoading(false); setLoadingMore(false); }
  }, [subTab, userId, token, enrichAndAppend]);

  useEffect(() => {
    offsetRef.current = 0; setHasMore(true); setPosts([]);
    if (subTab === "seguindo") sbSelect("follows", token, `follower_id=eq.${userId}&select=following_id`).then((f) => setFollowingIds(new Set(f.map((x) => x.following_id)))).catch(() => {});
    loadPage(true);
  }, [subTab]); // eslint-disable-line

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) loadPage(false);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, loadPage]);

  async function toggleLike(post) {
    const already = likesByPost[post.id]?.has(userId);
    setLikesByPost((prev) => { const next = new Set(prev[post.id] || []); already ? next.delete(userId) : next.add(userId); return { ...prev, [post.id]: next }; });
    try {
      if (already) await sbDelete("likes", token, `post_id=eq.${post.id}&user_id=eq.${userId}`);
      else await sbInsert("likes", token, [{ post_id: post.id, user_id: userId }]);
    } catch (e) { /* estado local já otimista */ }
  }
  async function addComment(post, text) {
    try {
      const created = await sbInsert("comments", token, [{ post_id: post.id, user_id: userId, content: text }]);
      setCommentsByPost((prev) => ({ ...prev, [post.id]: [...(prev[post.id] || []), created[0]] }));
      if (!profilesById[userId]) setProfilesById((p) => ({ ...p, [userId]: myProfile }));
    } catch (e) { /* silencioso */ }
  }
  async function toggleFollow(author) {
    const already = followingIds.has(author.id);
    setFollowingIds((prev) => { const next = new Set(prev); already ? next.delete(author.id) : next.add(author.id); return next; });
    try {
      if (already) await sbDelete("follows", token, `follower_id=eq.${userId}&following_id=eq.${author.id}`);
      else await sbInsert("follows", token, [{ follower_id: userId, following_id: author.id }]);
    } catch (e) { /* mantém estado local */ }
  }
  async function repost(post) {
    const original = profilesById[post.user_id] || { nome: "Atleta" };
    const meta = { original_author_id: post.user_id, original_author_nome: original.nome, original_author_avatar: original.avatar_url || null, original_content: post.content, original_image_url: post.image_url };
    try {
      const created = await sbInsert("posts", token, [{ user_id: userId, community_id: null, content: null, image_url: null, type: post.type, reposted_from: post.id, meta }]);
      setPosts((p) => [created[0], ...p]);
      setProfilesById((p) => ({ ...p, [userId]: myProfile }));
    } catch (e) { /* rate limit ou outro erro do trigger — silencioso aqui */ }
  }
  async function deletePost(post) {
    setPosts((p) => p.filter((x) => x.id !== post.id));
    try { await sbDelete("posts", token, `id=eq.${post.id}`); } catch (e) { /* já removido localmente */ }
  }
  async function handleNewPost({ content, imageUrl }) {
    try {
      const created = await sbInsert("posts", token, [{ user_id: userId, community_id: null, content, image_url: imageUrl || null, type: "foto" }]);
      setPosts((p) => [created[0], ...p]);
      setProfilesById((p) => ({ ...p, [userId]: myProfile }));
    } catch (e) { throw e; }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: "Bebas Neue", fontSize: 24, color: T.ink }}>Comunidade</div>
        <button onClick={onOpenMessages} style={{ position: "relative", width: 36, height: 36, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <MessageCircle size={17} />
          {hasUnreadDM && <span style={{ position: "absolute", top: -2, right: -2, width: 11, height: 11, borderRadius: "50%", background: T.red, border: `2px solid ${T.bg}` }} />}
        </button>
      </div>

      <StoriesBar userId={userId} token={token} myProfile={myProfile} />

      <div style={{ display: "flex", background: T.surface2, borderRadius: 12, padding: 4, marginBottom: 14, border: `1px solid ${T.line}` }}>
        {[["seguindo", "Seguindo"], ["paravoce", "Para Você"]].map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)} style={{
            flex: 1, padding: "9px 4px", borderRadius: 9, border: "none", cursor: "pointer",
            background: subTab === id ? T.flame : "transparent", color: subTab === id ? "#1B0D06" : T.steel,
            fontFamily: "Inter", fontWeight: 700, fontSize: 12.5,
          }}>{label}</button>
        ))}
      </div>

      <button onClick={() => setShowComposer(true)} style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: `1px dashed ${T.line}`, background: T.surface, color: T.steel, fontFamily: "Inter", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}>
        <Camera size={15} /> Nova publicação
      </button>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Spinner size={22} /></div>
      ) : posts.length === 0 ? (
        <EmptyState text={subTab === "seguindo" ? "Você ainda não segue ninguém. Vá em 'Para Você' pra descobrir gente." : "Nada por aqui ainda. Seja o primeiro a publicar!"} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {posts.map((post) => (
            <PostCard
              key={post.id} post={post} author={profilesById[post.user_id] || { id: post.user_id, nome: "Atleta" }}
              communityName={post.community_id ? communitiesById[post.community_id] : null}
              liked={!!likesByPost[post.id]?.has(userId)} likeCount={likesByPost[post.id]?.size || 0}
              comments={commentsByPost[post.id] || []} currentUserId={userId} commentAuthors={profilesById}
              following={followingIds.has(post.user_id)} onToggleFollow={toggleFollow} onRepost={repost} onDelete={deletePost}
              onToggleLike={toggleLike} onAddComment={addComment} onOpenProfile={onOpenProfile}
            />
          ))}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {loadingMore && <div style={{ display: "flex", justifyContent: "center", padding: 16 }}><Spinner size={18} /></div>}
          {!hasMore && posts.length > 0 && <div style={{ textAlign: "center", color: T.steelDim, fontFamily: "Inter", fontSize: 11.5, padding: 10 }}>Você chegou ao fim</div>}
        </div>
      )}

      {showComposer && <GlobalPostComposer token={token} onClose={() => setShowComposer(false)} onSubmit={handleNewPost} />}
    </div>
  );
}

function GlobalPostComposer({ token, onClose, onSubmit }) {
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }
  async function submit() {
    if (!content.trim() && !file) return;
    setLoading(true); setErr("");
    try {
      let imageUrl = null;
      if (file) {
        const path = `global/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
        imageUrl = await sbUploadFile("post-images", token, path, file);
      }
      await onSubmit({ content: content.trim(), imageUrl });
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Sheet onClose={onClose}>
      <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink, marginBottom: 4 }}>Nova publicação</div>
      <div style={{ color: T.steel, fontSize: 12.5, marginBottom: 14 }}>Tire uma foto ou escolha da galeria — vai pro Feed Global.</div>
      {preview ? (
        <div style={{ position: "relative", marginBottom: 12 }}>
          <img src={preview} alt="" style={{ width: "100%", borderRadius: 14, maxHeight: 260, objectFit: "cover" }} />
          <button onClick={() => { setFile(null); setPreview(null); }} style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={13} /></button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 18, borderRadius: 14, border: `1.5px dashed ${T.line}`, color: T.steel, fontFamily: "Inter", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <Camera size={20} /> Câmera
            <input type="file" accept="image/*" capture="environment" onChange={pickFile} style={{ display: "none" }} />
          </label>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 18, borderRadius: 14, border: `1.5px dashed ${T.line}`, color: T.steel, fontFamily: "Inter", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <ImageIcon size={20} /> Galeria
            <input type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} />
          </label>
        </div>
      )}
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Seu comentário sobre o treino, dieta ou shape..." style={{
        width: "100%", minHeight: 80, padding: 12, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface2,
        color: T.ink, fontFamily: "Inter", fontSize: 13.5, resize: "none", marginBottom: 14,
      }} />
      <ErrorBox msg={err} />
      <button disabled={loading || (!content.trim() && !file)} onClick={submit} style={{
        width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: loading ? "default" : "pointer",
        background: (content.trim() || file) ? `linear-gradient(90deg, ${T.flame}, ${T.flame2})` : T.surface2,
        color: (content.trim() || file) ? "#1B0D06" : T.steelDim, fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>{loading ? <Spinner size={16} color="#1B0D06" /> : "PUBLICAR"}</button>
    </Sheet>
  );
}

function CommunityBubble({ post, author, mine, liked, likeCount, onToggleLike, onAuthorClick, onLongPress }) {
  const timerRef = React.useRef(null);
  function startPress() { timerRef.current = setTimeout(() => onLongPress(post), 480); }
  function cancelPress() { if (timerRef.current) clearTimeout(timerRef.current); }

  if (post.is_deleted) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%", padding: "9px 13px", borderRadius: 14, background: T.surface2, color: T.steelDim, fontFamily: "Inter", fontSize: 12.5, fontStyle: "italic" }}>
        🚫 Mensagem apagada
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      onMouseDown={mine ? startPress : undefined} onMouseUp={mine ? cancelPress : undefined} onMouseLeave={mine ? cancelPress : undefined}
      onTouchStart={mine ? startPress : undefined} onTouchEnd={mine ? cancelPress : undefined}
      style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%", display: "flex", flexDirection: "column", gap: 3, userSelect: "none" }}>
      {!mine && (
        <button onClick={onAuthorClick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", alignSelf: "flex-start" }}>
          <span style={{ fontFamily: "Inter", fontSize: 10.5, color: T.steel, marginLeft: 4 }}>{author.nome || "Atleta"}</span>
        </button>
      )}
      <div style={{ borderRadius: 14, background: mine ? T.flame : T.surface2, color: mine ? "#1B0D06" : T.ink, overflow: "hidden", cursor: mine ? "pointer" : "default" }}>
        {post.type === "treino" && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 13px 0" }}>
            <Flame size={11} color={mine ? "#1B0D06" : T.flame2} />
            <span style={{ fontFamily: "Inter", fontSize: 9.5, fontWeight: 800, opacity: 0.85, letterSpacing: 0.3 }}>TREINO</span>
          </div>
        )}
        {post.image_url && <img src={post.image_url} alt="" style={{ width: "100%", maxWidth: 220, display: "block", maxHeight: 220, objectFit: "cover" }} />}
        {post.content && <div style={{ fontFamily: "Inter", fontSize: 13, padding: "8px 13px" }}>{post.content}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: mine ? "flex-end" : "flex-start", padding: "0 4px" }}>
        <button onClick={() => onToggleLike(post)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: liked ? T.flame : T.steelDim }}>
          <Heart size={12} fill={liked ? T.flame : "none"} /> {likeCount > 0 && <span style={{ fontFamily: "IBM Plex Mono", fontSize: 10 }}>{likeCount}</span>}
        </button>
        {post.is_edited && <span style={{ fontFamily: "Inter", fontSize: 9, color: T.steelDim }}>(editado)</span>}
        <span style={{ fontFamily: "Inter", fontSize: 9, color: T.steelDim }}>{fmtTime(post.created_at)}</span>
      </div>
    </motion.div>
  );
}

function FeedScreen({ userId, token, myProfile, community, onBack, onOpenMessages, onOpenProfile, hasUnreadDM }) {
  const [posts, setPosts] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [likesByPost, setLikesByPost] = useState({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [menuPost, setMenuPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [editText, setEditText] = useState("");
  const bottomRef = React.useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, l] = await Promise.all([
          sbSelect("posts", token, `community_id=eq.${community.id}&select=*&order=created_at.asc&limit=100`),
          sbSelect("likes", token, "select=*"),
        ]);
        setPosts(p);
        const uids = [...new Set(p.map((x) => x.user_id))];
        if (uids.length) {
          const profs = await sbSelect("public_profiles", token, `id=in.(${uids.join(",")})&select=*`);
          setProfilesById(Object.fromEntries(profs.map((pr) => [pr.id, pr])));
        }
        const lm = {}; l.forEach((x) => { (lm[x.post_id] ||= new Set()).add(x.user_id); }); setLikesByPost(lm);
        sbUpsert("community_reads", token, [{ user_id: userId, community_id: community.id, last_read_at: new Date().toISOString() }], "user_id,community_id").catch(() => {});
      } catch (e) { /* vazio */ }
      finally { setLoading(false); }
    })();

    const channel = supabaseRealtime
      .channel(`community-${community.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts", filter: `community_id=eq.${community.id}` }, async (payload) => {
        setPosts((prev) => prev.some((p) => p.id === payload.new.id) ? prev : [...prev, payload.new]);
        setProfilesById((prev) => {
          if (prev[payload.new.user_id]) return prev;
          sbSelect("public_profiles", token, `id=eq.${payload.new.user_id}&select=*`).then((r) => { if (r[0]) setProfilesById((p) => ({ ...p, [r[0].id]: r[0] })); }).catch(() => {});
          return prev;
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts", filter: `community_id=eq.${community.id}` }, (payload) => {
        setPosts((prev) => prev.map((p) => p.id === payload.new.id ? payload.new : p));
      })
      .subscribe();
    return () => supabaseRealtime.removeChannel(channel);
  }, [community.id, token, userId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [posts.length]);

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function send() {
    const content = text.trim();
    if (!content && !file) return;
    setSending(true); setErr("");
    try {
      let imageUrl = null;
      if (file) {
        const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
        imageUrl = await sbUploadFile("post-images", token, path, file);
      }
      const created = await sbInsert("posts", token, [{ user_id: userId, community_id: community.id, content, image_url: imageUrl, type: "foto" }]);
      setPosts((p) => [...p, created[0]]);
      setProfilesById((p) => ({ ...p, [userId]: myProfile }));
      setText(""); setFile(null); setPreview(null);
    } catch (e) { setErr(e.message); }
    finally { setSending(false); }
  }

  async function toggleLike(post) {
    const already = likesByPost[post.id]?.has(userId);
    setLikesByPost((prev) => { const next = new Set(prev[post.id] || []); already ? next.delete(userId) : next.add(userId); return { ...prev, [post.id]: next }; });
    try {
      if (already) await sbDelete("likes", token, `post_id=eq.${post.id}&user_id=eq.${userId}`);
      else await sbInsert("likes", token, [{ post_id: post.id, user_id: userId }]);
    } catch (e) { /* silencioso */ }
  }

  function startEdit(post) { setEditingPost(post); setEditText(post.content || ""); setMenuPost(null); }
  async function confirmEdit() {
    const content = editText.trim();
    if (!content || content === editingPost.content) { setEditingPost(null); return; }
    setPosts((prev) => prev.map((p) => p.id === editingPost.id ? { ...p, content, is_edited: true } : p));
    const id = editingPost.id;
    setEditingPost(null);
    try { await sbUpdate("posts", token, `id=eq.${id}`, { content, is_edited: true }); } catch (e) { /* mantém local */ }
  }
  async function deleteMessage(post) {
    setMenuPost(null);
    setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, is_deleted: true, content: "" } : p));
    try { await sbUpdate("posts", token, `id=eq.${post.id}`, { is_deleted: true, content: "" }); } catch (e) { /* mantém local */ }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><ArrowLeft size={16} /></button>
        <div style={{ fontFamily: "Bebas Neue", fontSize: 18, color: T.ink, textAlign: "center", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{community.nome}</div>
        <button onClick={onOpenMessages} style={{ position: "relative", width: 34, height: 34, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <MessageCircle size={16} />
          {hasUnreadDM && <span style={{ position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: "50%", background: T.red, border: `2px solid ${T.bg}` }} />}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, padding: "4px 2px 96px", minHeight: 200 }}>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner size={20} /></div>
          : posts.length === 0 ? <EmptyState text="Nenhuma mensagem ainda nessa comunidade. Comece a conversa!" />
          : (
            <AnimatePresence initial={false}>
              {posts.map((post) => (
                <CommunityBubble
                  key={post.id} post={post} author={profilesById[post.user_id] || { nome: "Atleta" }} mine={post.user_id === userId}
                  liked={!!likesByPost[post.id]?.has(userId)} likeCount={likesByPost[post.id]?.size || 0}
                  onToggleLike={toggleLike} onAuthorClick={() => onOpenProfile(profilesById[post.user_id] || { id: post.user_id, nome: "Atleta" })}
                  onLongPress={setMenuPost}
                />
              ))}
            </AnimatePresence>
          )}
        <div ref={bottomRef} />
      </div>

      <div style={{
        position: "fixed", bottom: 74, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, boxSizing: "border-box", zIndex: 40,
        background: hexToRgba(T.bg, 0.92), backdropFilter: "blur(10px)", borderTop: `1px solid ${T.line}`,
        padding: "8px 18px calc(8px + env(safe-area-inset-bottom, 0px))",
      }}>
        <ErrorBox msg={err} />
        {preview && (
          <div style={{ position: "relative", marginBottom: 8, alignSelf: "flex-start", width: 64 }}>
            <img src={preview} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover" }} />
            <button onClick={() => { setFile(null); setPreview(null); }} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: T.red, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={11} /></button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label style={{ width: 38, height: 38, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface2, color: T.steel, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <Camera size={15} />
            <input type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} />
          </label>
          <ChatTextarea value={text} onChange={setText} onSend={send} />
          <button disabled={sending} onClick={send} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.flame, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {sending ? <Spinner size={15} color="#fff" /> : <Send size={15} />}
          </button>
        </div>
      </div>

      {menuPost && !menuPost.is_deleted && (
        <Sheet onClose={() => setMenuPost(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => startEdit(menuPost)} style={{ padding: 14, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "left" }}>Editar mensagem</button>
            <button onClick={() => deleteMessage(menuPost)} style={{ padding: 14, borderRadius: 12, border: `1px solid ${T.red}`, background: hexToRgba(T.red, 0.08), color: T.red, fontFamily: "Inter", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "left" }}>Apagar mensagem</button>
          </div>
        </Sheet>
      )}
      {editingPost && (
        <Sheet onClose={() => setEditingPost(null)}>
          <div style={{ fontFamily: "Bebas Neue", fontSize: 18, color: T.ink, marginBottom: 12 }}>Editar mensagem</div>
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} style={{ width: "100%", minHeight: 70, padding: 12, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontSize: 13.5, resize: "none", marginBottom: 12 }} />
          <button onClick={confirmEdit} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: "pointer", background: T.flame, color: "#1B0D06", fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1 }}>SALVAR</button>
        </Sheet>
      )}
    </div>
  );
}
function SwipeRow({ id, swiped, onSwipe, onDelete, children }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16 }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end", alignItems: "stretch" }}>
        <button onClick={() => onDelete(id)} style={{ width: 70, border: "none", background: T.red, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 16 }}>
          <X size={18} />
        </button>
      </div>
      <motion.div
        drag="x" dragConstraints={{ left: -70, right: 0 }} dragElastic={0.05}
        animate={{ x: swiped ? -70 : 0 }} transition={{ type: "spring", stiffness: 420, damping: 38 }}
        onDragEnd={(e, info) => onSwipe(id, info.offset.x < -40)}
        style={{ touchAction: "pan-y", position: "relative", zIndex: 1 }}
      >
        {children}
      </motion.div>
    </div>
  );
}

function ChatListScreen({ userId, token, onlineIds, onBack, onOpenChat }) {
  const [chats, setChats] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [previews, setPreviews] = useState({}); // chatId -> { content, unread, hasImage, time }
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const [swipedId, setSwipedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [rows, prefs] = await Promise.all([
          sbSelect("chats", token, `or=(user_a.eq.${userId},user_b.eq.${userId})&select=*&order=created_at.desc`),
          sbSelect("chat_prefs", token, `user_id=eq.${userId}&hidden=eq.true&select=chat_id`),
        ]);
        setChats(rows);
        setHiddenIds(new Set(prefs.map((p) => p.chat_id)));
        const otherIds = rows.map((c) => c.user_a === userId ? c.user_b : c.user_a);
        if (otherIds.length) {
          const profs = await sbSelect("public_profiles", token, `id=in.(${otherIds.join(",")})&select=*`);
          setProfilesById(Object.fromEntries(profs.map((p) => [p.id, p])));
        }
        if (rows.length) {
          const chatIds = rows.map((c) => c.id).join(",");
          const msgs = await sbSelect("messages", token, `chat_id=in.(${chatIds})&select=*&order=created_at.desc&limit=500`);
          const prev = {};
          rows.forEach((c) => {
            const doChat = msgs.filter((m) => m.chat_id === c.id);
            const last = doChat[0];
            const unread = doChat.filter((m) => m.sender_id !== userId && !m.lida).length;
            prev[c.id] = { content: last?.content || "", hasImage: !!last?.image_url, unread, time: last?.created_at };
          });
          setPreviews(prev);
        }
      } catch (e) { /* lista vazia */ }
      finally { setLoading(false); }
    })();
  }, [userId, token]);

  async function handleDelete(chatId) {
    setHiddenIds((s) => new Set([...s, chatId]));
    setSwipedId(null);
    try { await sbUpsert("chat_prefs", token, [{ user_id: userId, chat_id: chatId, hidden: true }], "user_id,chat_id"); } catch (e) { /* mantém oculto localmente */ }
  }

  const visibleChats = chats
    .filter((c) => !hiddenIds.has(c.id))
    .sort((a, b) => {
      const pa = previews[a.id] || {}, pb = previews[b.id] || {};
      if (!!pa.unread !== !!pb.unread) return pb.unread ? 1 : -1; // não lidas primeiro
      return new Date(pb.time || b.created_at) - new Date(pa.time || a.created_at);
    });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><ArrowLeft size={16} /></button>
        <div style={{ fontFamily: "Bebas Neue", fontSize: 22, color: T.ink }}>Mensagens</div>
      </div>
      {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Spinner size={22} /></div>
        : visibleChats.length === 0 ? <EmptyState text="Nenhuma conversa ainda. Toque no nome de alguém pra começar." />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleChats.map((c) => {
              const otherId = c.user_a === userId ? c.user_b : c.user_a;
              const other = profilesById[otherId] || { nome: "Atleta" };
              const preview = previews[c.id] || { content: "", unread: 0 };
              const isOnline = onlineIds?.has(otherId);
              return (
                <SwipeRow key={c.id} id={c.id} swiped={swipedId === c.id} onSwipe={(id, isOpen) => setSwipedId(isOpen ? id : null)} onDelete={handleDelete}>
                  <Card className="card-fx" onClick={() => onOpenChat({ id: c.id, otherId, otherName: other.nome })} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: 12 }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      {other.avatar_url ? <img src={other.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center" }}><User size={18} color={T.steelDim} /></div>}
                      {isOnline && <span style={{ position: "absolute", bottom: -1, right: -1, width: 11, height: 11, borderRadius: "50%", background: "#3EC46D", border: `2px solid ${T.bg}` }} />}
                      {preview.unread > 0 && (
                        <span style={{ position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 999, background: T.red, color: "#fff", fontFamily: "Inter", fontWeight: 800, fontSize: 9.5, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.bg}` }}>
                          {preview.unread > 9 ? "9+" : preview.unread}
                        </span>
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: "Inter", fontWeight: preview.unread > 0 ? 800 : 700, fontSize: 13.5, color: T.ink }}>{other.nome || "Atleta"}</div>
                      {(preview.content || preview.hasImage) && (
                        <div style={{ fontFamily: "Inter", fontSize: 11.5, color: preview.unread > 0 ? T.ink : T.steelDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                          {preview.hasImage && !preview.content && <><ImageIcon size={11} /> Foto</>}
                          {preview.content}
                        </div>
                      )}
                    </div>
                    {preview.time && <span style={{ fontFamily: "Inter", fontSize: 10, color: T.steelDim, flexShrink: 0 }}>{new Date(preview.time).toDateString() === new Date().toDateString() ? fmtTime(preview.time) : dateDividerLabel(preview.time)}</span>}
                  </Card>
                </SwipeRow>
              );
            })}
          </div>
        )}
    </div>
  );
}

function fmtTime(iso) { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function dateDividerLabel(iso) {
  const d = new Date(iso), today = new Date(), yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Hoje";
  if (same(d, yest)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

function ChatTextarea({ value, onChange, onSend }) {
  const ref = React.useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [value]);
  return (
    <textarea
      ref={ref} value={value} rows={1}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
      placeholder="Digite uma mensagem..."
      style={{
        flex: 1, padding: "10px 16px", borderRadius: 20, border: "none", background: T.surface2, color: T.ink,
        fontFamily: "Inter", fontSize: 13.5, resize: "none", overflowY: "auto", maxHeight: 120, lineHeight: 1.4,
      }}
    />
  );
}

function MessageBubble({ m, mine, isLastInGroup, onLongPress }) {
  const timerRef = React.useRef(null);
  function startPress() { timerRef.current = setTimeout(() => onLongPress(m), 480); }
  function cancelPress() { if (timerRef.current) clearTimeout(timerRef.current); }

  if (m.is_deleted) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%", padding: "9px 13px", borderRadius: 16, background: T.surface2, color: T.steelDim, fontFamily: "Inter", fontSize: 12.5, fontStyle: "italic" }}>
        🚫 Mensagem apagada
      </motion.div>
    );
  }
  const tailRadius = 4;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      onMouseDown={mine ? startPress : undefined} onMouseUp={mine ? cancelPress : undefined} onMouseLeave={mine ? cancelPress : undefined}
      onTouchStart={mine ? startPress : undefined} onTouchEnd={mine ? cancelPress : undefined}
      style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%", display: "flex", flexDirection: "column", gap: 2, userSelect: "none" }}
    >
      <div style={{
        borderRadius: 16,
        borderBottomRightRadius: mine && isLastInGroup ? tailRadius : 16,
        borderBottomLeftRadius: !mine && isLastInGroup ? tailRadius : 16,
        background: mine ? T.flame : T.surface2, color: mine ? "#fff" : T.ink, overflow: "hidden", cursor: mine ? "pointer" : "default",
      }}>
        {m.image_url && <img src={m.image_url} alt="" style={{ width: "100%", maxWidth: 200, display: "block", maxHeight: 220, objectFit: "cover" }} />}
        {m.content && <div style={{ padding: "9px 13px", fontFamily: "Inter", fontSize: 13 }}>{m.content}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, alignSelf: mine ? "flex-end" : "flex-start", padding: "0 3px" }}>
        {m.is_edited && <span style={{ fontFamily: "Inter", fontSize: 9.5, color: T.steelDim }}>(editado)</span>}
        <span style={{ fontFamily: "Inter", fontSize: 9.5, color: T.steelDim }}>{fmtTime(m.created_at)}</span>
        {mine && (
          m.lida
            ? <span style={{ display: "flex" }}><Check size={11} color={T.blue} style={{ marginRight: -6 }} /><Check size={11} color={T.blue} /></span>
            : <Check size={11} color={T.steelDim} />
        )}
      </div>
    </motion.div>
  );
}

function ChatScreen({ chat, userId, token, myNome, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuMsg, setMenuMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState("");
  const bottomRef = React.useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await sbSelect("messages", token, `chat_id=eq.${chat.id}&select=*&order=created_at.asc&limit=200`);
        setMessages(rows);
        // marca como lidas todas as mensagens recebidas (não enviadas por mim) ao abrir o chat
        const naoLidas = rows.some((m) => m.sender_id !== userId && !m.lida);
        if (naoLidas) sbUpdate("messages", token, `chat_id=eq.${chat.id}&sender_id=neq.${userId}&lida=eq.false`, { lida: true, read_at: new Date().toISOString() }).catch(() => {});
      } catch (e) { /* vazio */ }
      finally { setLoading(false); }
    })();

    // Supabase Realtime: ouve inserções E atualizações nesse chat (novas mensagens, "visto", edição, apagar)
    const channel = supabaseRealtime
      .channel(`chat-${chat.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chat.id}` }, (payload) => {
        setMessages((prev) => prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        if (payload.new.sender_id !== userId) sbUpdate("messages", token, `id=eq.${payload.new.id}`, { lida: true, read_at: new Date().toISOString() }).catch(() => {});
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chat.id}` }, (payload) => {
        setMessages((prev) => prev.map((m) => m.id === payload.new.id ? payload.new : m));
      })
      .subscribe();
    return () => supabaseRealtime.removeChannel(channel);
  }, [chat.id, token]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const renderItems = useMemo(() => {
    const items = [];
    let lastDateStr = null;
    messages.forEach((m, i) => {
      const dateStr = new Date(m.created_at).toDateString();
      if (dateStr !== lastDateStr) { items.push({ type: "divider", key: `d-${dateStr}-${i}`, label: dateDividerLabel(m.created_at) }); lastDateStr = dateStr; }
      const next = messages[i + 1];
      const isLastInGroup = !next || next.sender_id !== m.sender_id || new Date(next.created_at).toDateString() !== dateStr;
      items.push({ type: "msg", key: m.id, m, isLastInGroup });
    });
    return items;
  }, [messages]);

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  // UI otimista: a mensagem aparece na hora, antes mesmo da resposta do banco
  async function send() {
    const content = text.trim();
    if (!content && !file) return;
    setText("");
    const tempId = `temp-${Date.now()}`;
    let imageUrl = null;
    try {
      if (file) {
        const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
        imageUrl = await sbUploadFile("post-images", token, path, file);
      }
      setFile(null); setPreview(null);
      setMessages((prev) => [...prev, { id: tempId, chat_id: chat.id, sender_id: userId, content, image_url: imageUrl, created_at: new Date().toISOString(), lida: false }]);
      const created = await sbInsert("messages", token, [{ chat_id: chat.id, sender_id: userId, receiver_id: chat.otherId, content, image_url: imageUrl }]);
      setMessages((prev) => prev.map((m) => m.id === tempId ? created[0] : m));
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  }

  function startEdit(m) { setEditingMsg(m); setEditText(m.content); setMenuMsg(null); }
  async function confirmEdit() {
    const content = editText.trim();
    if (!content || content === editingMsg.content) { setEditingMsg(null); return; }
    setMessages((prev) => prev.map((m) => m.id === editingMsg.id ? { ...m, content, is_edited: true } : m));
    const id = editingMsg.id;
    setEditingMsg(null);
    try { await sbUpdate("messages", token, `id=eq.${id}`, { content, is_edited: true }); } catch (e) { /* mantém local */ }
  }
  async function deleteMessage(m) {
    setMenuMsg(null);
    setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, is_deleted: true, content: "" } : x));
    try { await sbUpdate("messages", token, `id=eq.${m.id}`, { is_deleted: true }); } catch (e) { /* mantém local */ }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 14, position: "sticky", top: 0, zIndex: 5,
        background: hexToRgba(T.bg, 0.75), backdropFilter: "blur(10px)", padding: "4px 0",
      }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><ArrowLeft size={16} /></button>
        <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink }}>{chat.otherName}</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, minHeight: 200, paddingBottom: 96 }}>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner size={20} /></div>
          : (
            <AnimatePresence initial={false}>
              {renderItems.map((item) => item.type === "divider" ? (
                <div key={item.key} style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
                  <span style={{ fontFamily: "Inter", fontSize: 10.5, fontWeight: 700, color: T.steelDim, background: T.surface2, padding: "4px 12px", borderRadius: 999 }}>{item.label}</span>
                </div>
              ) : (
                <div key={item.key} style={{ marginBottom: item.isLastInGroup ? 8 : 2, display: "flex", flexDirection: "column" }}>
                  <MessageBubble m={item.m} mine={item.m.sender_id === userId} isLastInGroup={item.isLastInGroup} onLongPress={setMenuMsg} />
                </div>
              ))}
            </AnimatePresence>
          )}
        <div ref={bottomRef} />
      </div>

      {/* barra de digitação fixa, ancorada acima da bottom nav do app
          (nav ocupa ~72px), alinhada com a coluna central do app */}
      <div style={{
        position: "fixed", bottom: 74, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, boxSizing: "border-box", zIndex: 40,
        background: hexToRgba(T.bg, 0.92), backdropFilter: "blur(10px)", borderTop: `1px solid ${T.line}`,
        padding: "8px 18px calc(8px + env(safe-area-inset-bottom, 0px))",
      }}>
        {preview && (
          <div style={{ position: "relative", marginBottom: 8, alignSelf: "flex-start", width: 64 }}>
            <img src={preview} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover" }} />
            <button onClick={() => { setFile(null); setPreview(null); }} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: T.red, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={11} /></button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label style={{ width: 38, height: 38, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface2, color: T.steel, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <Link2 size={15} />
            <input type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} />
          </label>
          <ChatTextarea value={text} onChange={setText} onSend={send} />
          <button onClick={send} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.flame, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Send size={15} /></button>
        </div>
      </div>

      {menuMsg && !menuMsg.is_deleted && (
        <Sheet onClose={() => setMenuMsg(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => startEdit(menuMsg)} style={{ padding: 14, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "left" }}>Editar mensagem</button>
            <button onClick={() => deleteMessage(menuMsg)} style={{ padding: 14, borderRadius: 12, border: `1px solid ${T.red}`, background: hexToRgba(T.red, 0.08), color: T.red, fontFamily: "Inter", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "left" }}>Apagar mensagem</button>
          </div>
        </Sheet>
      )}

      {editingMsg && (
        <Sheet onClose={() => setEditingMsg(null)}>
          <div style={{ fontFamily: "Bebas Neue", fontSize: 18, color: T.ink, marginBottom: 12 }}>Editar mensagem</div>
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} style={{ width: "100%", minHeight: 70, padding: 12, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontSize: 13.5, resize: "none", marginBottom: 12 }} />
          <button onClick={confirmEdit} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: "pointer", background: T.flame, color: "#1B0D06", fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1 }}>SALVAR</button>
        </Sheet>
      )}
    </div>
  );
}

function CommunityDiscoveryScreen({ userId, token, onOpenMessages, onEnterCommunity, refreshKey, myProfile, hasUnreadDM }) {
  const [communities, setCommunities] = useState([]);
  const [myMemberships, setMyMemberships] = useState(new Set());
  const [unreadByCommunity, setUnreadByCommunity] = useState({}); // id -> boolean
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [all, mine, reads] = await Promise.all([
          sbSelect("communities", token, "select=*&order=created_at.asc"),
          sbSelect("community_members", token, `user_id=eq.${userId}&select=community_id`),
          sbSelect("community_reads", token, `user_id=eq.${userId}&select=*`),
        ]);
        setCommunities(all);
        const memberIds = mine.map((m) => m.community_id);
        setMyMemberships(new Set(memberIds));
        if (memberIds.length) {
          const lastPosts = await sbSelect("posts", token, `community_id=in.(${memberIds.join(",")})&select=community_id,created_at&order=created_at.desc&limit=500`);
          const readsMap = Object.fromEntries(reads.map((r) => [r.community_id, r.last_read_at]));
          const lastByCommunity = {};
          lastPosts.forEach((p) => { if (!lastByCommunity[p.community_id]) lastByCommunity[p.community_id] = p.created_at; });
          const unread = {};
          memberIds.forEach((id) => {
            const last = lastByCommunity[id];
            unread[id] = !!last && (!readsMap[id] || new Date(last) > new Date(readsMap[id]));
          });
          setUnreadByCommunity(unread);
        }
      } catch (e) { /* lista vazia */ }
      finally { setLoading(false); }
    })();
  }, [userId, token, refreshKey, localRefresh]);

  async function join(community) {
    setJoining(community.id);
    try {
      await sbInsert("community_members", token, [{ user_id: userId, community_id: community.id }]);
      setMyMemberships((s) => new Set([...s, community.id]));
      onEnterCommunity(community);
    } catch (e) { /* pode já ser membro; tenta entrar mesmo assim */ onEnterCommunity(community); }
    finally { setJoining(null); }
  }

  async function handleCreated(community) {
    setMyMemberships((s) => new Set([...s, community.id]));
    setCommunities((c) => [...c, community]);
    setShowCreate(false);
    onEnterCommunity(community);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: "Bebas Neue", fontSize: 24, color: T.ink }}>Comunidade</div>
        <button onClick={onOpenMessages} style={{ position: "relative", width: 36, height: 36, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <MessageCircle size={17} />
          {hasUnreadDM && <span style={{ position: "absolute", top: -2, right: -2, width: 11, height: 11, borderRadius: "50%", background: T.red, border: `2px solid ${T.bg}` }} />}
        </button>
      </div>
      <div style={{ fontFamily: "Inter", fontSize: 12.5, color: T.steel, marginBottom: 14 }}>Escolha um grupo com o seu foco e treine em boa companhia.</div>

      <button onClick={() => setShowCreate(true)} style={{
        width: "100%", padding: "12px 16px", borderRadius: 14, border: `1.5px dashed ${T.flame}`, background: hexToRgba(T.flame, 0.06),
        color: T.flame2, fontFamily: "Inter", fontWeight: 700, fontSize: 13, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18,
      }}><Plus size={15} /> Nova comunidade</button>

      {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Spinner size={22} /></div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {communities.map((c) => {
              const isMember = myMemberships.has(c.id);
              const hasUnread = unreadByCommunity[c.id];
              return (
                <Card key={c.id} style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    {c.capa_url ? (
                      <img src={c.capa_url} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center" }}><Users size={18} color={T.steelDim} /></div>
                    )}
                    {hasUnread && (
                      <span style={{ position: "absolute", top: -3, right: -3, width: 12, height: 12, borderRadius: "50%", background: T.red, border: `2px solid ${T.bg}` }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 4 }}>{c.nome}</div>
                    {c.descricao && <div style={{ fontFamily: "Inter", fontSize: 12, color: T.steel, marginBottom: 12, lineHeight: 1.4 }}>{c.descricao}</div>}
                    <button
                      disabled={joining === c.id}
                      onClick={() => isMember ? onEnterCommunity(c) : join(c)}
                      style={{
                        width: "100%", padding: "10px", borderRadius: 10, border: isMember ? `1px solid ${T.line}` : "none",
                        cursor: "pointer", background: isMember ? T.surface2 : `linear-gradient(90deg, ${T.flame}, ${T.flame2})`,
                        color: isMember ? T.ink : "#1B0D06", fontFamily: "Inter", fontWeight: 700, fontSize: 12.5,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}
                    >
                      {joining === c.id ? <Spinner size={13} color={isMember ? T.ink : "#1B0D06"} /> : isMember ? "Abrir comunidade" : "Entrar na comunidade"}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      {showCreate && <CreateCommunityModal userId={userId} token={token} onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  );
}

function CreateCommunityModal({ userId, token, onClose, onCreated }) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    if (!nome.trim()) return;
    setLoading(true); setErr("");
    try {
      let capaUrl = null;
      if (file) {
        const path = `covers/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
        capaUrl = await sbUploadFile("post-images", token, path, file);
      }
      const created = await sbInsert("communities", token, [{ nome: nome.trim(), descricao: descricao.trim() || null, capa_url: capaUrl }]);
      const community = created[0];
      await sbInsert("community_members", token, [{ user_id: userId, community_id: community.id, is_admin: true }]);
      onCreated(community);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Sheet onClose={onClose}>
      <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink, marginBottom: 16 }}>Nova comunidade</div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <label style={{ position: "relative", cursor: "pointer", width: 72, height: 72 }}>
          {preview ? (
            <img src={preview} alt="" style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: 16, background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px dashed ${T.line}` }}>
              <ImageIcon size={22} color={T.steelDim} />
            </div>
          )}
          <div style={{ position: "absolute", bottom: -2, right: -2, width: 26, height: 26, borderRadius: "50%", background: T.flame, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.surface}` }}>
            <Camera size={12} color="#1B0D06" />
          </div>
          <input type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "Inter", fontSize: 11, color: T.steel, marginBottom: 6, fontWeight: 700 }}>NOME DA COMUNIDADE</div>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Turma do Crossfit — Centro" style={{ width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontSize: 13.5 }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Inter", fontSize: 11, color: T.steel, marginBottom: 6, fontWeight: 700 }}>DESCRIÇÃO / REGRAS (OPCIONAL)</div>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Do que se trata essa comunidade?" style={{ width: "100%", minHeight: 70, padding: 12, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontSize: 13, resize: "none" }} />
      </div>
      <ErrorBox msg={err} />
      <button disabled={loading || !nome.trim()} onClick={submit} style={{
        width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: (loading || !nome.trim()) ? "default" : "pointer",
        background: nome.trim() ? `linear-gradient(90deg, ${T.flame}, ${T.flame2})` : T.surface2, color: nome.trim() ? "#1B0D06" : T.steelDim,
        fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>{loading ? <Spinner size={16} color="#1B0D06" /> : "CRIAR COMUNIDADE"}</button>
    </Sheet>
  );
}

function StoryViewer({ group, onClose }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => { if (idx < group.stories.length - 1) setIdx((i) => i + 1); else onClose(); }, 5000);
    return () => clearTimeout(t);
  }, [idx]);
  const story = group.stories[idx];
  return (
    <div onClick={(e) => {
      const x = e.clientX, w = e.currentTarget.clientWidth;
      if (x < w / 2) { if (idx > 0) setIdx((i) => i - 1); } else { if (idx < group.stories.length - 1) setIdx((i) => i + 1); else onClose(); }
    }} style={{ position: "fixed", inset: 0, background: "#000", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", gap: 4 }}>
        {group.stories.map((s, i) => (
          <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, background: i < idx ? "#fff" : i === idx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)" }} />
        ))}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: "absolute", top: 20, right: 14, background: "none", border: "none", color: "#fff", cursor: "pointer", zIndex: 2 }}><X size={22} /></button>
      <img src={story.media_url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
    </div>
  );
}

function StoriesBar({ userId, token, myProfile }) {
  const [stories, setStories] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [viewedIds, setViewedIds] = useState(new Set());
  const [viewerGroup, setViewerGroup] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await sbSelect("stories", token, "select=*&order=created_at.asc");
        setStories(rows);
        const uids = [...new Set(rows.map((r) => r.user_id))];
        if (uids.length) {
          const profs = await sbSelect("public_profiles", token, `id=in.(${uids.join(",")})&select=*`);
          setProfilesById(Object.fromEntries(profs.map((p) => [p.id, p])));
        }
        const seen = await sbSelect("story_views", token, `user_id=eq.${userId}&select=story_id`);
        setViewedIds(new Set(seen.map((s) => s.story_id)));
      } catch (e) { /* sem stories */ }
    })();
  }, [userId, token]);

  const grouped = useMemo(() => {
    const byUser = {};
    stories.forEach((s) => { (byUser[s.user_id] ||= []).push(s); });
    return Object.entries(byUser).map(([uid, list]) => ({ userId: uid, stories: list, hasUnseen: list.some((s) => !viewedIds.has(s.id)) }));
  }, [stories, viewedIds]);

  async function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const path = `${userId}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
      const url = await sbUploadFile("stories", token, path, f);
      const created = await sbInsert("stories", token, [{ user_id: userId, media_url: url }]);
      setStories((s) => [...s, created[0]]);
      setProfilesById((p) => ({ ...p, [userId]: myProfile }));
    } catch (e) { /* falha silenciosa */ }
    finally { setUploading(false); }
  }

  function openGroup(g) {
    setViewerGroup(g);
    g.stories.forEach((s) => { if (!viewedIds.has(s.id)) sbInsert("story_views", token, [{ user_id: userId, story_id: s.id }]).catch(() => {}); });
    setViewedIds((prev) => new Set([...prev, ...g.stories.map((s) => s.id)]));
  }

  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6, marginBottom: 14 }}>
      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0, cursor: "pointer" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", border: `1.5px dashed ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center", background: T.surface2 }}>
          {uploading ? <Spinner size={16} /> : <Plus size={20} color={T.steel} />}
        </div>
        <span style={{ fontFamily: "Inter", fontSize: 9.5, color: T.steel }}>Seu story</span>
        <input type="file" accept="image/*" capture="environment" onChange={pickFile} style={{ display: "none" }} />
      </label>
      {grouped.map((g) => {
        const p = profilesById[g.userId] || {};
        return (
          <button key={g.userId} onClick={() => openGroup(g)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0, cursor: "pointer" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", padding: 2, background: g.hasUnseen ? `linear-gradient(135deg, ${T.flame}, ${T.flame2})` : T.line }}>
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", padding: 2, background: T.bg }}>
                {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center" }}><User size={18} color={T.steelDim} /></div>}
              </div>
            </div>
            <span style={{ fontFamily: "Inter", fontSize: 9.5, color: T.steel, maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome || "Atleta"}</span>
          </button>
        );
      })}
      {viewerGroup && <StoryViewer group={viewerGroup} onClose={() => setViewerGroup(null)} />}
    </div>
  );
}

function ProfileViewScreen({ user, token, onBack, onMessage }) {
  const [full, setFull] = useState(user);
  const [streak, setStreak] = useState(null);
  const [grid, setGrid] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [profs, streaks, photos, posts] = await Promise.all([
          sbSelect("public_profiles", token, `id=eq.${user.id}&select=*`),
          sbSelect("streaks", token, `user_id=eq.${user.id}&select=streak_atual`),
          sbSelect("progress_photos", token, `user_id=eq.${user.id}&is_private=eq.false&select=*&order=created_at.desc&limit=30`),
          sbSelect("posts", token, `user_id=eq.${user.id}&community_id=is.null&image_url=not.is.null&select=*&order=created_at.desc&limit=30`),
        ]);
        if (profs[0]) setFull(profs[0]);
        setStreak(streaks[0]?.streak_atual ?? null);
        const combo = [
          ...photos.map((p) => ({ id: `ph-${p.id}`, image_url: p.image_url, created_at: p.created_at })),
          ...posts.map((p) => ({ id: `po-${p.id}`, image_url: p.image_url, created_at: p.created_at })),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setGrid(combo);
      } catch (e) { /* perfil parcial */ }
      finally { setLoading(false); }
    })();
  }, [user.id, token]);

  return (
    <div>
      <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 16 }}><ArrowLeft size={16} /></button>

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        {full.avatar_url ? <img src={full.avatar_url} alt="" style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", margin: "0 auto 12px", display: "block" }} /> : <div style={{ width: 84, height: 84, borderRadius: "50%", background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><User size={34} color={T.steelDim} /></div>}
        <div style={{ fontFamily: "Bebas Neue", fontSize: 22, color: T.ink }}>{full.nome || "Atleta"}</div>
        {streak != null && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "5px 12px", borderRadius: 999, background: hexToRgba(T.flame, 0.10) }}>
            <Flame size={13} color={T.flame} /><span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: T.flame2 }}>{streak} dias de ofensiva</span>
          </div>
        )}
        <div>
          <button onClick={onMessage} style={{ marginTop: 14, padding: "9px 18px", borderRadius: 999, border: "none", background: `linear-gradient(90deg, ${T.flame}, ${T.flame2})`, color: "#1B0D06", fontFamily: "Inter", fontWeight: 700, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <MessageCircle size={14} /> Enviar mensagem
          </button>
        </div>
      </div>

      <SectionTitle>Evolução</SectionTitle>
      {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner size={20} /></div>
        : grid.length === 0 ? <EmptyState text="Sem fotos públicas ainda." />
        : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            {grid.map((g) => (
              <div key={g.id} style={{ aspectRatio: "1", borderRadius: 4, overflow: "hidden", background: T.surface2 }}>
                <img src={g.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function ComunidadeScreen({ userId, token, myProfile, onlineIds, hasUnreadDM }) {
  const [view, setView] = useState("explore"); // explore | discover | community | chats | chat | profile
  const [activeCommunity, setActiveCommunity] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [returnView, setReturnView] = useState("explore");

  async function openChatWith(otherUser) {
    const [a, b] = userId < otherUser.id ? [userId, otherUser.id] : [otherUser.id, userId];
    try {
      let existing = await sbSelect("chats", token, `user_a=eq.${a}&user_b=eq.${b}&select=*`);
      let chat = existing[0];
      if (!chat) {
        const created = await sbUpsert("chats", token, [{ user_a: a, user_b: b }], "user_a,user_b");
        chat = created[0];
      }
      setActiveChat({ id: chat.id, otherId: otherUser.id, otherName: otherUser.nome || "Atleta" });
      setView("chat");
    } catch (e) { /* falha silenciosa, tenta de novo depois */ }
  }
  function openProfile(user) {
    if (user.id === userId) return; // já está no seu próprio Perfil (outra aba)
    setViewingUser(user);
    setReturnView(view);
    setView("profile");
  }

  if (view === "profile" && viewingUser) return <ProfileViewScreen user={viewingUser} token={token} onBack={() => setView(returnView)} onMessage={() => openChatWith(viewingUser)} />;
  if (view === "chats") return <ChatListScreen userId={userId} token={token} onlineIds={onlineIds} onBack={() => setView(activeCommunity ? "community" : "explore")} onOpenChat={(c) => { setActiveChat(c); setView("chat"); }} />;
  if (view === "chat" && activeChat) return <ChatScreen chat={activeChat} userId={userId} token={token} myNome={myProfile.nome} onBack={() => setView("chats")} />;
  if (view === "community" && activeCommunity) return <FeedScreen userId={userId} token={token} myProfile={myProfile} community={activeCommunity} onBack={() => setView("discover")} onOpenMessages={() => setView("chats")} onOpenProfile={openProfile} hasUnreadDM={hasUnreadDM} />;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Pill active={view === "explore"} onClick={() => setView("explore")}>Explorar</Pill>
        <Pill active={view === "discover"} onClick={() => setView("discover")}>Grupos</Pill>
      </div>
      {view === "explore"
        ? <ExploreScreen userId={userId} token={token} myProfile={myProfile} onOpenMessages={() => setView("chats")} onOpenProfile={openProfile} hasUnreadDM={hasUnreadDM} />
        : <CommunityDiscoveryScreen userId={userId} token={token} onOpenMessages={() => setView("chats")} onEnterCommunity={(c) => { setActiveCommunity(c); setView("community"); }} hasUnreadDM={hasUnreadDM} />}
    </div>
  );
}

/* ============================================================
   PERFIL / GAMIFICAÇÃO
   ============================================================ */
function PerfilTab({ profile, email, token, streak, trainedToday, freezes, onUseFreeze, totalKg, workoutCount, onLogout, onSaveProfile, exerciseLogs, bodyLogs, workoutLogs, weekMeals, metaKcal, onAddBodyLog, progressPhotos, bodyLogCount, messagesSentCount, communitiesJoinedCount }) {
  const [editing, setEditing] = useState(false);
  const [sub, setSub] = useState("dados"); // dados | progresso | conquistas

  const badges = [
    { id: "b1", nome: "O Despertar da Forja", desc: "Finalizou o 1º treino com a IA", icon: Dumbbell, unlocked: workoutCount >= 1 },
    { id: "b2", nome: "7 dias de chama", desc: "Streak de 7 dias seguidos", icon: Flame, unlocked: streak >= 7 },
    { id: "b3", nome: "21 dias de chama", desc: "Streak de 21 dias seguidos", icon: Flame, unlocked: streak >= 21 },
    { id: "b4", nome: "90 dias de chama", desc: "Streak de 90 dias seguidos", icon: Flame, unlocked: streak >= 90 },
    { id: "b5", nome: "1 tonelada", desc: "1.000 kg de volume total", icon: Trophy, unlocked: totalKg >= 1000 },
    { id: "b6", nome: "5 toneladas", desc: "5.000 kg de volume total", icon: Trophy, unlocked: totalKg >= 5000 },
    { id: "b7", nome: "10 toneladas", desc: "10.000 kg de volume total", icon: Trophy, unlocked: totalKg >= 10000 },
    { id: "b8", nome: "O Observador", desc: "5 fotos na timeline de progresso", icon: Camera, unlocked: (progressPhotos?.length || 0) >= 5 },
    { id: "b9", nome: "Corpo em Mutação", desc: "3 registros de peso corporal", icon: TrendingUp, unlocked: (bodyLogCount || 0) >= 3 },
    { id: "b10", nome: "Socializador", desc: "1ª mensagem ou 1ª comunidade", icon: Users, unlocked: (messagesSentCount || 0) >= 1 || (communitiesJoinedCount || 0) >= 1 },
  ];

  return (
    <div>
      <Card style={{ textAlign: "center", padding: "18px 16px" }}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", margin: "0 auto 10px", border: `2px solid ${T.flame}`, display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
            <User size={28} color={T.steelDim} />
          </div>
        )}
        <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink }}>{profile.nome || "Atleta"}</div>
        <div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.steel }}>{email}</div>
        <button onClick={() => setEditing(true)} style={{
          marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999,
          border: `1px solid ${T.line}`, background: T.surface2, color: T.ink, fontFamily: "Inter", fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}><Settings size={13} /> Editar perfil</button>
      </Card>

      <div style={{ display: "flex", background: T.surface2, borderRadius: 12, padding: 4, marginTop: 16, marginBottom: 16, border: `1px solid ${T.line}` }}>
        {[["dados", "Meus Dados"], ["progresso", "Meu Progresso"], ["conquistas", "Conquistas"]].map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} style={{
            flex: 1, padding: "9px 4px", borderRadius: 9, border: "none", cursor: "pointer",
            background: sub === id ? T.flame : "transparent", color: sub === id ? "#1B0D06" : T.steel,
            fontFamily: "Inter", fontWeight: 700, fontSize: 11.5,
          }}>{label}</button>
        ))}
      </div>

      {sub === "dados" && (
        <div>
          <Card style={{ background: trainedToday ? `linear-gradient(135deg, ${hexToRgba(T.flame, 0.16)}, ${hexToRgba(T.flame2, 0.05)})` : T.surface, border: `1px solid ${trainedToday ? T.flame : T.line}`, textAlign: "center", padding: "26px 16px" }}>
            <FlameBadge size={54} active={trainedToday} />
            <div style={{ fontFamily: "Bebas Neue", fontSize: 46, color: T.ink, marginTop: 8, lineHeight: 1 }}>{streak}</div>
            <div style={{ fontFamily: "Inter", fontSize: 12.5, color: trainedToday ? T.flame2 : T.steelDim, letterSpacing: 1, fontWeight: 700 }}>{trainedToday ? "DIAS DE OFENSIVA" : "TREINE HOJE PRA CONTINUAR"}</div>
          </Card>

          <SectionTitle right={<span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: T.steel }}>{freezes} disponíveis</span>}>Congelamento de streak</SectionTitle>
          <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: hexToRgba(T.blue, 0.15), display: "flex", alignItems: "center", justifyContent: "center" }}><Snowflake size={20} color={T.blue} /></div>
              <div>
                <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 13.5, color: T.ink }}>Passe de congelamento</div>
                <div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.steel }}>Protege sua ofensiva se faltar 1 dia</div>
              </div>
            </div>
            <button disabled={freezes === 0} onClick={onUseFreeze} style={{ padding: "9px 14px", borderRadius: 10, border: "none", cursor: freezes ? "pointer" : "not-allowed", background: freezes ? T.blue : T.surface2, color: freezes ? "#0E1013" : T.steelDim, fontFamily: "Inter", fontWeight: 700, fontSize: 12.5 }}>Usar</button>
          </Card>

          <SectionTitle>Total levantado</SectionTitle>
          <Card style={{ textAlign: "center", padding: 22 }}>
            <div style={{ fontFamily: "Bebas Neue", fontSize: 38, color: T.ink }}>{(totalKg / 1000).toFixed(2)}<span style={{ fontSize: 18, color: T.steel }}> toneladas</span></div>
            <div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.steel, marginTop: 4 }}>peso × séries × repetições, somado</div>
          </Card>

          <button onClick={onLogout} style={{ width: "100%", marginTop: 22, padding: 14, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface, color: T.steel, fontFamily: "Inter", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <LogOut size={15} /> Sair da conta
          </button>
        </div>
      )}

      {sub === "progresso" && (
        <div>
          <ProgressoTab exerciseLogs={exerciseLogs} bodyLogs={bodyLogs} workoutLogs={workoutLogs} weekMeals={weekMeals} metaKcal={metaKcal} onAddBodyLog={onAddBodyLog} />
          <SectionTitle>Timeline visual</SectionTitle>
          {(!progressPhotos || progressPhotos.length === 0) ? (
            <EmptyState text="Nenhuma foto de progresso ainda. Elas aparecem aqui sempre que você registra uma foto pós-treino." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {progressPhotos.map((p) => (
                <div key={p.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: T.surface2 }}>
                  <img src={p.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 6px", background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
                    <span style={{ fontFamily: "Inter", fontSize: 8.5, color: "#fff" }}>{new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sub === "conquistas" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {badges.map((b) => (
              <Card key={b.id} style={{ opacity: b.unlocked ? 1 : 0.4, filter: b.unlocked ? "none" : "grayscale(1)", padding: 14, border: b.unlocked ? `1px solid ${T.flame2}` : `1px solid ${T.line}`, transition: "opacity .2s, filter .2s" }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  background: b.unlocked ? `linear-gradient(135deg, ${hexToRgba(T.flame2, 0.25)}, ${hexToRgba(T.flame, 0.15)})` : T.surface2,
                }}>
                  {b.unlocked ? <b.icon size={18} color={T.flame2} /> : <Lock size={16} color={T.steelDim} />}
                </div>
                <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 12.5, color: T.ink }}>{b.nome}</div>
                <div style={{ fontFamily: "Inter", fontSize: 10.5, color: T.steel, marginTop: 2 }}>{b.desc}</div>
              </Card>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 16, fontFamily: "Inter", fontSize: 11.5, color: T.steel }}>
            {badges.filter((b) => b.unlocked).length} de {badges.length} desbloqueadas
          </div>
        </div>
      )}

      {editing && <EditProfileModal profile={profile} token={token} onClose={() => setEditing(false)} onSave={onSaveProfile} />}
    </div>
  );
}
function EditProfileModal({ profile, token, onClose, onSave }) {
  const [form, setForm] = useState({
    nome: profile.nome || "", email: profile.email || "", avatar_url: profile.avatar_url || "",
    objetivo_principal: profile.objetivo_principal, nivel_experiencia: profile.nivel_experiencia,
    dias_semana: profile.dias_semana, foco_muscular: profile.foco_muscular,
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr("");
    try {
      const path = `${profile.id}/avatar-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
      const url = await sbUploadFile("avatars", token, path, file);
      setForm((f) => ({ ...f, avatar_url: url }));
    } catch (e2) { setErr(e2.message); }
    finally { setUploading(false); }
  }

  function pillField(key, label, options) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "Inter", fontSize: 11, color: T.steel, marginBottom: 6, fontWeight: 700 }}>{label}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {options.map((op) => (
            <button key={op.id} onClick={() => setForm((f) => ({ ...f, [key]: op.id }))} style={{
              padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontFamily: "Inter", fontWeight: 600,
              border: `1.5px solid ${form[key] === op.id ? T.flame : T.line}`,
              background: form[key] === op.id ? hexToRgba(T.flame, 0.10) : T.surface2, color: T.ink,
            }}>{op.label}</button>
          ))}
        </div>
      </div>
    );
  }

  async function submit() {
    setLoading(true); setErr("");
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Sheet onClose={onClose}>
      <div style={{ fontFamily: "Bebas Neue", fontSize: 20, color: T.ink, marginBottom: 16 }}>Editar perfil</div>
      <div style={{ maxHeight: "55vh", overflowY: "auto", paddingRight: 2 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <label style={{ position: "relative", cursor: "pointer", width: 84, height: 84 }}>
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="" style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", border: `2px solid ${T.line}`, display: "block" }} />
            ) : (
              <div style={{ width: 84, height: 84, borderRadius: "50%", background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.line}` }}>
                <User size={32} color={T.steelDim} />
              </div>
            )}
            <div style={{
              position: "absolute", bottom: -2, right: -2, width: 30, height: 30, borderRadius: "50%",
              background: T.flame, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.surface}`,
            }}>
              {uploading ? <Spinner size={13} color="#1B0D06" /> : <Camera size={14} color="#1B0D06" />}
            </div>
            <input type="file" accept="image/*" onChange={pickAvatar} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: "Inter", fontSize: 11, color: T.steel, marginBottom: 6, fontWeight: 700 }}>NOME</div>
          <InputField icon={User} placeholder="Seu nome" value={form.nome} onChange={(v) => setForm((f) => ({ ...f, nome: v }))} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "Inter", fontSize: 11, color: T.steel, marginBottom: 6, fontWeight: 700 }}>E-MAIL</div>
          <InputField icon={Mail} type="email" placeholder="seu@email.com" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
        </div>
        <div style={{ height: 1, background: T.line, margin: "6px 0 16px" }} />
        <div style={{ fontFamily: "Inter", fontSize: 12, color: T.ink, fontWeight: 700, marginBottom: 10 }}>Metas de treino</div>
        {pillField("objetivo_principal", "OBJETIVO", [{ id: "hipertrofia", label: "Hipertrofia" }, { id: "emagrecimento", label: "Emagrecimento" }, { id: "condicionamento", label: "Condicionamento" }, { id: "forca", label: "Força" }])}
        {pillField("nivel_experiencia", "NÍVEL", [{ id: "iniciante", label: "Iniciante" }, { id: "intermediario", label: "Intermediário" }, { id: "avancado", label: "Avançado" }])}
        {pillField("dias_semana", "DIAS/SEMANA", [{ id: 2, label: "2" }, { id: 3, label: "3" }, { id: 4, label: "4" }, { id: 5, label: "5+" }])}
        {pillField("foco_muscular", "FOCO MUSCULAR", [{ id: "corpo_inteiro", label: "Corpo inteiro" }, { id: "superior", label: "Superior" }, { id: "inferior", label: "Inferior" }, { id: "core", label: "Core" }])}
        <div style={{ color: T.steelDim, fontSize: 11, marginTop: 4 }}>Alterar metas de treino gera um novo plano automaticamente.</div>
      </div>
      <ErrorBox msg={err} />
      <button disabled={loading} onClick={submit} style={{
        marginTop: 14, width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: loading ? "default" : "pointer",
        background: `linear-gradient(90deg, ${T.flame}, ${T.flame2})`, color: "#1B0D06", fontFamily: "Bebas Neue", fontSize: 16, letterSpacing: 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {loading ? <Spinner size={16} color="#1B0D06" /> : "SALVAR ALTERAÇÕES"}
      </button>
    </Sheet>
  );
}

/* ============================================================
   INÍCIO
   ============================================================ */
function InicioTab({ profile, streak, trainedToday, plan, dayIndex, goTreino, volumeSemana, treinosSemana }) {
  const nextDay = plan[dayIndex];
  return (
    <div>
      <Card style={{ display: "flex", alignItems: "center", gap: 14, borderColor: trainedToday ? T.flame : T.line }}>
        <FlameBadge size={40} active={trainedToday} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.steel }}>{trainedToday ? "ofensiva atual" : "treine hoje pra manter a chama"}</div>
          <div style={{ fontFamily: "Bebas Neue", fontSize: 26, color: T.ink, lineHeight: 1 }}>{streak} dias seguidos</div>
        </div>
      </Card>

      <SectionTitle>Próximo treino</SectionTitle>
      {nextDay ? (
        <Card className="card-fx" style={{ background: `linear-gradient(135deg, ${T.surface2}, ${T.surface})`, cursor: "pointer" }} onClick={goTreino}>
          <div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.volt, fontWeight: 700, letterSpacing: 0.5 }}>PLANO GERADO PELA IA</div>
          <div style={{ fontFamily: "Bebas Neue", fontSize: 22, color: T.ink, margin: "6px 0" }}>{nextDay.nome}</div>
          <div style={{ fontFamily: "Inter", fontSize: 12.5, color: T.steel, marginBottom: 12 }}>{nextDay.exercicios.length} exercícios · {EQUIP_LABEL[profile.equipamento]}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, background: T.flame, color: "#1B0D06", fontFamily: "Inter", fontWeight: 700, fontSize: 13 }}>Começar treino <ArrowRight size={15} /></div>
        </Card>
      ) : (
        <Card className="card-fx" style={{ background: `linear-gradient(135deg, ${T.surface2}, ${T.surface})`, cursor: "pointer", textAlign: "center" }} onClick={goTreino}>
          <Sparkles size={22} color={T.flame} style={{ marginBottom: 8 }} />
          <div style={{ fontFamily: "Bebas Neue", fontSize: 18, color: T.ink, marginBottom: 4 }}>Você ainda não tem um treino</div>
          <div style={{ fontFamily: "Inter", fontSize: 12.5, color: T.steel }}>Toque aqui pra deixar a IA forjar o seu primeiro plano</div>
        </Card>
      )}

      <SectionTitle>Resumo da semana</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Card><div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.steel }}>volume (7 dias)</div><div style={{ fontFamily: "Bebas Neue", fontSize: 24, color: T.volt }}>{Math.round(volumeSemana)} <span style={{ fontSize: 13, color: T.steel }}>kg</span></div></Card>
        <Card><div style={{ fontFamily: "Inter", fontSize: 11.5, color: T.steel }}>treinos (7 dias)</div><div style={{ fontFamily: "Bebas Neue", fontSize: 24, color: T.ink }}>{treinosSemana}<span style={{ fontSize: 13, color: T.steel }}>/{plan.length}</span></div></Card>
      </div>

      <SectionTitle>Seu perfil</SectionTitle>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontFamily: "Inter", fontSize: 12.5 }}>
          <ProfileRow label="Objetivo" value={OBJ_PRINCIPAL_LABEL[profile.objetivo_principal]} />
          <ProfileRow label="Nível" value={EXP_LABEL[profile.nivel_experiencia]} />
          <ProfileRow label="Foco" value={FOCO_LABEL[profile.foco_muscular]} />
          <ProfileRow label="Dias/semana" value={profile.dias_semana} />
          <ProfileRow label="Peso" value={`${profile.peso} kg`} />
          <ProfileRow label="Altura" value={`${profile.altura || "—"} cm`} />
        </div>
      </Card>
    </div>
  );
}
function ProfileRow({ label, value }) {
  return <div><div style={{ color: T.steel }}>{label}</div><div style={{ color: T.ink, fontWeight: 700, marginTop: 2 }}>{value}</div></div>;
}

/* ============================================================
   APP SHELL — dados do app (perfil, treino, dieta...). A sessão
   em si vem do AuthContext (useAuth), não é mais estado local.
   ============================================================ */
function AppShell() {
  const { session, authPhase, logout, invalidateSession, updateSessionUser } = useAuth();
  const [nome, setNome] = useState("");
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [streak, setStreak] = useState(0);
  const [freezes, setFreezes] = useState(2);
  const [lastDate, setLastDate] = useState(null);
  const [exerciseLogs, setExerciseLogs] = useState([]);
  const [bodyLogs, setBodyLogs] = useState([]);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [meals, setMeals] = useState([]);
  const [weekMeals, setWeekMeals] = useState([]);
  const [aiDietSuggestions, setAiDietSuggestions] = useState([]);
  const [myCommunities, setMyCommunities] = useState([]);
  const [progressPhotos, setProgressPhotos] = useState([]);
  const [messagesSentCount, setMessagesSentCount] = useState(0);
  const [waterMl, setWaterMl] = useState(0);

  const [tab, setTab] = useState("inicio");
  const [dayIndex, setDayIndex] = useState(0);
  const [phase, setPhase] = useState("loading");
  const [onbSaving, setOnbSaving] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [onbError, setOnbError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [authBanner, setAuthBanner] = useState("");
  const [themeMode, setThemeMode] = useState("dark");

  useEffect(() => {
    const stored = readPersistedTheme();
    if (stored) { applyTheme(stored); setThemeMode(stored); }
    else if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      applyTheme("light"); setThemeMode("light");
    }
  }, []);
  function toggleTheme() {
    const next = themeMode === "dark" ? "light" : "dark";
    applyTheme(next);
    setThemeMode(next);
    persistTheme(next);
  }

  const loadAll = useCallback(async (token, uid) => {
    setPhase("loading");
    try {
      const profs = await sbSelect("profiles", token, `id=eq.${uid}&select=*`);
      if (!profs.length) { setPhase("onboarding"); return; }
      const prof = profs[0];
      setProfile({ ...prof, lesao_regiao: prof.lesao_regiao || "nenhuma" });
      sbUpsert("public_profiles", token, [{ id: uid, nome: prof.nome, avatar_url: prof.avatar_url || null }], "id").catch(() => {});
      setAiDietSuggestions(prof.ai_diet_suggestions || []);
      setNome(prof.nome);

      const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString();
      const results = await Promise.allSettled([
        sbSelect("workout_plans", token, `user_id=eq.${uid}&select=*`),
        sbSelect("streaks", token, `user_id=eq.${uid}&select=*`),
        sbSelect("exercise_logs", token, `user_id=eq.${uid}&select=*&order=created_at.desc&limit=200`),
        sbSelect("body_logs", token, `user_id=eq.${uid}&select=*&order=created_at.desc&limit=60`),
        sbSelect("workout_logs", token, `user_id=eq.${uid}&select=*&order=created_at.desc&limit=200`),
        sbSelect("meals", token, `user_id=eq.${uid}&select=*&created_at=gte.${todayStr()}T00:00:00`),
        sbSelect("water_logs", token, `user_id=eq.${uid}&select=*&created_at=eq.${todayStr()}`),
        sbSelect("meals", token, `user_id=eq.${uid}&select=*&created_at=gte.${sevenDaysAgo}`),
      ]);
      const val = (r) => r.status === "fulfilled" ? r.value : [];
      const [plans, streaks, exLogs, bLogs, wLogs, mealsToday, waterToday, mealsWeekRes] = results.map(val);

      // sem geração automática de plano — o usuário cria com a IA
      // quando quiser, a partir do Empty State da aba Treino
      const planRow = plans[0];
      setPlan(planRow ? planRow.plano : []);

      let streakRow = streaks[0];
      if (!streakRow) {
        try {
          const created = await sbUpsert("streaks", token, [{ user_id: uid, streak_atual: 0, freezes: 2 }], "user_id");
          streakRow = created[0];
        } catch (e) { /* segue com padrão */ }
      }
      setStreak(streakRow?.streak_atual ?? 0);
      setFreezes(streakRow?.freezes ?? 2);
      setLastDate(streakRow?.ultima_data ?? null);

      setExerciseLogs(exLogs);
      setBodyLogs(bLogs);
      setWorkoutLogs(wLogs);
      setMeals(mealsToday);
      setWeekMeals(mealsWeekRes);
      setWaterMl(waterToday.reduce((s, r) => s + r.ml, 0));

      // dados da Comunidade usados no Perfil (conquistas) e no fluxo pós-treino
      try {
        const [memberships, photos, sentMsgs] = await Promise.all([
          sbSelect("community_members", token, `user_id=eq.${uid}&select=*,communities(*)`),
          sbSelect("progress_photos", token, `user_id=eq.${uid}&select=*&order=created_at.desc&limit=100`),
          sbSelect("messages", token, `sender_id=eq.${uid}&select=id&limit=1`),
        ]);
        setMyCommunities(memberships.map((m) => m.communities).filter(Boolean));
        setProgressPhotos(photos);
        setMessagesSentCount(sentMsgs.length);
      } catch (e) { /* opcional, não bloqueia o resto do app */ }

      setAuthBanner("");
      setPhase("ready");
    } catch (e) {
      setAuthBanner("Sua sessão expirou ou houve um problema de conexão. Faça login novamente.");
      invalidateSession();
      setPhase("auth");
    }
  }, [invalidateSession]);

  useEffect(() => {
    if (authPhase !== "ready") return;
    if (session) {
      const nomeCapturado = pendingSignupName.take();
      if (nomeCapturado) setNome(nomeCapturado);
      loadAll(session.token, session.user.id);
    } else {
      setPhase("auth");
    }
  }, [authPhase, session, loadAll]);

  // Notificação global de mensagens não lidas — ouve a tabela `messages`
  // filtrando por receiver_id (funciona em qualquer tela, não só no chat)
  useEffect(() => {
    if (!session) { setUnreadCount(0); return; }
    async function refreshUnread() {
      try {
        const rows = await sbSelect("messages", session.token, `receiver_id=eq.${session.user.id}&lida=eq.false&select=id`);
        setUnreadCount(rows.length);
      } catch (e) { /* mantém contagem anterior */ }
    }
    refreshUnread();
    const channel = supabaseRealtime
      .channel(`unread-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${session.user.id}` }, refreshUnread)
      .subscribe();
    return () => supabaseRealtime.removeChannel(channel);
  }, [session]);

  // Presença global — quem está online agora (Supabase Presence), ativo
  // enquanto o app estiver aberto, não só na tela de mensagens
  useEffect(() => {
    if (!session) { setOnlineIds(new Set()); return; }
    const channel = supabaseRealtime.channel("presence-online", { config: { presence: { key: session.user.id } } });
    channel.on("presence", { event: "sync" }, () => {
      setOnlineIds(new Set(Object.keys(channel.presenceState())));
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await channel.track({ online_at: new Date().toISOString() });
    });
    return () => supabaseRealtime.removeChannel(channel);
  }, [session]);

  async function handleOnboardingDone(data) {
    setOnbSaving(true); setOnbError("");
    try {
      const row = {
        id: session.user.id, nome: nome || session.user.email.split("@")[0],
        objetivo_principal: data.objetivo_principal, nivel_experiencia: data.nivel_experiencia,
        dias_semana: data.dias_semana, tempo_categoria: data.tempo_categoria,
        equipamento: data.equipamento, lesao_regiao: data.lesao_regiao,
        foco_muscular: data.foco_muscular, faixa_etaria: data.faixa_etaria,
        nivel_atividade: data.nivel_atividade, dieta_tipo: data.dieta_tipo, peso: data.peso, altura: data.altura,
        refeicoes_dia: data.refeicoes_dia, restricoes_alimentares: data.restricoes_alimentares,
        relacao_alimentacao: data.relacao_alimentacao, consumo_agua: data.consumo_agua,
        preferencia_cardapio: data.preferencia_cardapio,
      };
      await sbInsert("profiles", session.token, [row]);
      await sbUpsert("public_profiles", session.token, [{ id: session.user.id, nome: row.nome, avatar_url: null }], "id");
      await sbUpsert("streaks", session.token, [{ user_id: session.user.id, streak_atual: 0, freezes: 2 }], "user_id");
      await loadAll(session.token, session.user.id);
      setShowWelcome(true);
    } catch (e) {
      setOnbError(e.message);
    } finally {
      setOnbSaving(false);
    }
  }

  async function handleSwap(dIdx, exId, novoNome) {
    const newPlan = plan.map((d, i) => i !== dIdx ? d : { ...d, exercicios: d.exercicios.map((e) => e.id === exId ? { ...e, nome: novoNome } : e) });
    setPlan(newPlan);
    try { await sbUpdate("workout_plans", session.token, `user_id=eq.${session.user.id}`, { plano: newPlan }); }
    catch (e) { setGlobalError(e.message); }
  }

  async function handleFinishWorkout(dIdx, feedback, cargaRows) {
    const day = plan[dIdx];
    const newPlan = plan.map((d, i) => i !== dIdx ? d : {
      ...d, exercicios: d.exercicios.map((e) => ({ ...e, series: feedback === "facil" ? e.series + 1 : feedback === "dificil" ? Math.max(2, e.series - 1) : e.series })),
    });
    setPlan(newPlan);

    const today = todayStr();
    let novoStreak = streak;
    if (lastDate !== today) {
      const gap = lastDate ? daysBetween(lastDate, today) : 1;
      novoStreak = gap <= 1 ? streak + 1 : 1;
    }
    setStreak(novoStreak);
    setLastDate(today);

    try {
      await Promise.all([
        sbUpdate("workout_plans", session.token, `user_id=eq.${session.user.id}`, { plano: newPlan }),
        sbInsert("workout_logs", session.token, [{ user_id: session.user.id, dia_nome: day.nome, feedback }]),
        sbUpdate("streaks", session.token, `user_id=eq.${session.user.id}`, { streak_atual: novoStreak, ultima_data: today }),
        cargaRows.length ? sbInsert("exercise_logs", session.token, cargaRows.map((c) => ({ user_id: session.user.id, exercicio: c.nome, carga: c.carga, series: c.series, reps: c.reps }))) : Promise.resolve(),
      ]);
      const [wLogs, exLogs] = await Promise.all([
        sbSelect("workout_logs", session.token, `user_id=eq.${session.user.id}&select=*&order=created_at.desc&limit=200`),
        sbSelect("exercise_logs", session.token, `user_id=eq.${session.user.id}&select=*&order=created_at.desc&limit=200`),
      ]);
      setWorkoutLogs(wLogs); setExerciseLogs(exLogs);
    } catch (e) { setGlobalError(e.message); }
  }

  async function handleShareWorkout(day, cargaRows, file, communityId) {
    const totalKgSessao = cargaRows.reduce((s, c) => s + (c.carga || 0) * (c.series || 0) * (parseInt(c.reps) || 10), 0);
    const foco = day.nome.includes("—") ? day.nome.split("—")[1].trim() : day.nome;
    const content = `🔥 ${profile.nome || "Atleta"} finalizou o treino de ${foco}${totalKgSessao > 0 ? ` — ${Math.round(totalKgSessao)}kg levantados!` : "!"}`;
    try {
      let imageUrl = null;
      if (file) {
        const path = `${session.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
        imageUrl = await sbUploadFile("post-images", session.token, path, file);
      }
      await sbInsert("posts", session.token, [{ user_id: session.user.id, community_id: communityId, content, image_url: imageUrl, type: "treino", meta: { dia_nome: day.nome, kg: totalKgSessao } }]);
      if (imageUrl) {
        const created = await sbInsert("progress_photos", session.token, [{ user_id: session.user.id, image_url: imageUrl, is_private: false, workout_summary: content }]);
        setProgressPhotos((p) => [created[0], ...p]);
      }
    } catch (e) { setGlobalError(e.message); throw e; }
  }

  async function handleSaveWorkoutPhoto(day, cargaRows, file) {
    if (!file) return;
    try {
      const path = `${session.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
      const imageUrl = await sbUploadFile("progress-photos", session.token, path, file);
      const created = await sbInsert("progress_photos", session.token, [{ user_id: session.user.id, image_url: imageUrl, is_private: true, workout_summary: day.nome }]);
      setProgressPhotos((p) => [created[0], ...p]);
    } catch (e) { setGlobalError(e.message); throw e; }
  }

  async function handleAddBodyLog(pesoVal, gorduraVal) {
    try {
      const created = await sbInsert("body_logs", session.token, [{ user_id: session.user.id, peso: pesoVal, gordura: gorduraVal }]);
      setBodyLogs((b) => [created[0], ...b]);
    } catch (e) { setGlobalError(e.message); }
  }
  async function handleAddMeal(food, slotId) {
    const qtd = defaultQtd(food);
    const factor = unitFactor(food, qtd);
    const row = {
      user_id: session.user.id, nome: food.nome, qtd,
      kcal: food.kcal * factor, proteina: food.p * factor, carbo: food.c * factor, gordura: food.g * factor,
      horario_slot: slotId, food_id: food.id || null,
      base_kcal: food.kcal, base_p: food.p, base_c: food.c, base_g: food.g,
      unit_type: isCountUnit(food.unidade) ? "count" : "gram",
    };
    try {
      const created = await sbInsert("meals", session.token, [row]);
      setMeals((m) => [...m, created[0]]);
      setWeekMeals((w) => [...w, created[0]]);
    } catch (e) { setGlobalError(e.message); }
  }
  async function handleUseAISuggestion(sug, slotId) {
    const row = {
      user_id: session.user.id, nome: sug.sugestao, qtd: 1,
      kcal: sug.kcal, proteina: sug.proteina, carbo: sug.carboidrato, gordura: sug.gordura,
      horario_slot: slotId, food_id: null,
      base_kcal: sug.kcal, base_p: sug.proteina, base_c: sug.carboidrato, base_g: sug.gordura,
      unit_type: "count",
    };
    try {
      const created = await sbInsert("meals", session.token, [row]);
      setMeals((m) => [...m, created[0]]);
      setWeekMeals((w) => [...w, created[0]]);
      const novaLista = aiDietSuggestions.filter((s) => s.slot !== slotId);
      setAiDietSuggestions(novaLista);
      try { await sbUpdate("profiles", session.token, `id=eq.${session.user.id}`, { ai_diet_suggestions: novaLista }); } catch (e2) {}
    } catch (e) { setGlobalError(e.message); }
  }
  // Fórmula: valorAtual = (quantidadeAtual / porcaoBaseGrams) × valorBase
  // porcaoBaseGrams é sempre 100 (g ou ml) para itens "gram", ou a própria
  // quantidade para itens "count" (ex: 1 ovo, 1 scoop).
  async function applyMealQty(meal, novaQtdRaw) {
    if (meal.base_kcal == null || !meal.unit_type) { setGlobalError("Este item foi registrado antes da atualização e não pode ter a quantidade ajustada."); return; }
    const novaQtd = Math.max(meal.unit_type === "count" ? 1 : 1, novaQtdRaw);
    const factor = meal.unit_type === "count" ? novaQtd : novaQtd / 100;
    const patch = { qtd: novaQtd, kcal: meal.base_kcal * factor, proteina: meal.base_p * factor, carbo: meal.base_c * factor, gordura: meal.base_g * factor };
    const apply = (arr) => arr.map((r) => r.id === meal.id ? { ...r, ...patch } : r);
    setMeals(apply);
    setWeekMeals(apply);
    try { await sbUpdate("meals", session.token, `id=eq.${meal.id}`, patch); }
    catch (e) { setGlobalError(e.message); }
  }
  function handleUpdateMealQty(meal, delta) {
    const step = meal.unit_type === "count" ? 1 : 10;
    applyMealQty(meal, (meal.qtd || 0) + delta * step);
  }
  function handleSetMealQty(meal, novaQtdExata) {
    applyMealQty(meal, novaQtdExata);
  }
  async function handleRemoveMeal(id) {
    setMeals((m) => m.filter((r) => r.id !== id));
    setWeekMeals((w) => w.filter((r) => r.id !== id));
    try { await sbDelete("meals", session.token, `id=eq.${id}`); } catch (e) { setGlobalError(e.message); }
  }
  async function handleAddWater() {
    setWaterMl((w) => w + 250);
    try { await sbInsert("water_logs", session.token, [{ user_id: session.user.id, ml: 250 }]); } catch (e) { setGlobalError(e.message); }
  }
  async function handleRemoveWater() {
    if (waterMl <= 0) return;
    setWaterMl((w) => Math.max(0, w - 250));
    try {
      const rows = await sbSelect("water_logs", session.token, `user_id=eq.${session.user.id}&created_at=eq.${todayStr()}&select=*&order=id.desc&limit=1`);
      if (rows[0]) await sbDelete("water_logs", session.token, `id=eq.${rows[0].id}`);
    } catch (e) { setGlobalError(e.message); }
  }
  async function handleUseFreeze() {
    if (freezes <= 0) return;
    setFreezes((f) => f - 1);
    try { await sbUpdate("streaks", session.token, `user_id=eq.${session.user.id}`, { freezes: freezes - 1 }); } catch (e) { setGlobalError(e.message); }
  }
  async function handleGenerateWithAI(params) {
    const mergedProfile = { ...profile, ...params };
    const result = await generatePlanWithAI(mergedProfile, session.token);
    setPlan(result.plano);
    setAiDietSuggestions(result.dieta);
    setDayIndex(0);
    try {
      await sbUpdate("workout_plans", session.token, `user_id=eq.${session.user.id}`, { plano: result.plano });
      await sbUpdate("profiles", session.token, `id=eq.${session.user.id}`, { ai_diet_suggestions: result.dieta });
    } catch (e) { setGlobalError(e.message); }
  }

  async function handleGenerateDietWithAI(alimentoDesejado) {
    const params = alimentoDesejado ? { ...profile, alimento_desejado: alimentoDesejado } : profile;
    const result = await generatePlanWithAI(params, session.token);
    setAiDietSuggestions(result.dieta);
    try { await sbUpdate("profiles", session.token, `id=eq.${session.user.id}`, { ai_diet_suggestions: result.dieta }); }
    catch (e) { setGlobalError(e.message); }
  }

  async function handleSaveProfile(form) {
    const patch = {
      nome: form.nome, avatar_url: form.avatar_url || null,
      objetivo_principal: form.objetivo_principal, nivel_experiencia: form.nivel_experiencia,
      dias_semana: form.dias_semana, foco_muscular: form.foco_muscular,
    };
    await sbUpdate("profiles", session.token, `id=eq.${session.user.id}`, patch);
    await sbUpsert("public_profiles", session.token, [{ id: session.user.id, nome: patch.nome, avatar_url: patch.avatar_url }], "id");
    if (form.email && form.email !== session.user.email) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT", headers: sbHeaders(session.token), body: JSON.stringify({ email: form.email }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.msg || "Não foi possível atualizar o e-mail."); }
      updateSessionUser({ email: form.email });
    }
    const updatedProfile = { ...profile, ...patch };
    setProfile(updatedProfile);
    setNome(patch.nome);
    const newPlan = generatePlan(updatedProfile);
    setPlan(newPlan);
    setDayIndex(0);
    await sbUpdate("workout_plans", session.token, `user_id=eq.${session.user.id}`, { plano: newPlan });
  }

  function handleLogout() {
    logout();
    setProfile(null); setPlan(null); setPhase("auth");
  }

  const volumeSemana = useMemo(() => {
    const since = Date.now() - 7 * 86400000;
    return exerciseLogs.filter((l) => new Date(l.created_at).getTime() >= since).reduce((s, l) => s + (l.carga || 0) * (l.series || 0) * (parseInt(l.reps) || 10), 0);
  }, [exerciseLogs]);
  const treinosSemana = useMemo(() => {
    const since = Date.now() - 7 * 86400000;
    return new Set(workoutLogs.filter((l) => new Date(l.created_at).getTime() >= since).map((l) => l.created_at.slice(0, 10))).size;
  }, [workoutLogs]);
  const totalKg = useMemo(() => exerciseLogs.reduce((s, l) => s + (l.carga || 0) * (l.series || 0) * (parseInt(l.reps) || 10), 0), [exerciseLogs]);
  const trainedToday = lastDate === todayStr();
  const metaKcal = profile ? calcMacros(profile.peso, profile.objetivo_principal, profile.nivel_atividade).kcal : 0;

  const TABS = [
    { id: "inicio", label: "Início", icon: Home }, { id: "treino", label: "Treino", icon: Dumbbell },
    { id: "dieta", label: "Dieta", icon: Utensils },
    { id: "comunidade", label: "Comunidade", icon: Users }, { id: "perfil", label: "Perfil", icon: User },
  ];

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: "Inter", display: "flex", justifyContent: "center" }}>
      <link rel="stylesheet" href={FONTS_LINK} />
      <style>{`
        @keyframes flicker { 0%,100%{ transform: scale(1); opacity:.55 } 50%{ transform: scale(1.15); opacity:.85 } }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes tabFade { from { opacity:0; transform: translateX(10px); } to { opacity:1; transform: translateX(0); } }
        @keyframes backdropFade { from { opacity:0 } to { opacity:1 } }
        @keyframes sheetUp { from { transform: translateY(24px); opacity:0; } to { transform: translateY(0); opacity:1; } }
        @keyframes screenFade { from { opacity:0; } to { opacity:1; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
        body, input, textarea { transition: background-color .25s ease, color .25s ease; }
        button:not(:disabled) { transition: transform .12s ease, opacity .12s ease; }
        button:not(:disabled):active { transform: scale(0.96); }
        .tab-transition { animation: tabFade .28s ease; }
        .sheet-backdrop { animation: backdropFade .2s ease; }
        .sheet-panel { animation: sheetUp .25s cubic-bezier(.22,1,.36,1); }
        .card-fx { transition: transform .15s ease, border-color .15s ease; }
        .card-fx:hover { transform: translateY(-2px); }
        .card-fx:active { transform: scale(0.98); }
      `}</style>

      <div className="tab-transition" style={{ width: "100%", maxWidth: 430, position: "relative", background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {phase === "auth" && <div style={{ flex: 1, display: "flex" }}><AuthScreen banner={authBanner} /></div>}

        {phase === "loading" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <Spinner size={30} />
            <div style={{ fontFamily: "Inter", fontSize: 13, color: T.steel }}>Carregando seus dados...</div>
          </div>
        )}

        {phase === "onboarding" && <div style={{ flex: 1, display: "flex" }}><Onboarding onDone={handleOnboardingDone} saving={onbSaving} error={onbError} /></div>}

        {phase === "ready" && profile && plan && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 40, background: T.bg, padding: "18px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontFamily: "Bebas Neue", fontSize: 22, letterSpacing: 1, color: T.ink }}>FORJA<span style={{ color: T.flame }}>.</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={toggleTheme} style={{ width: 32, height: 32, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, color: T.steel, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  {themeMode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 999, padding: "6px 12px" }}>
                  <Flame size={15} color={trainedToday ? T.flame : T.steelDim} fill={trainedToday ? T.flame : T.surface2} />
                  <span style={{ fontFamily: "IBM Plex Mono", fontWeight: 600, fontSize: 13, color: T.ink }}>{streak}</span>
                </div>
              </div>
            </div>

            {globalError && <div style={{ padding: "10px 18px 0" }}><ErrorBox msg={globalError} /></div>}

            <div key={tab} className="tab-transition" style={{ flex: 1, padding: "16px 18px 100px" }}>
              {tab === "inicio" && <InicioTab profile={profile} streak={streak} trainedToday={trainedToday} plan={plan} dayIndex={dayIndex} goTreino={() => setTab("treino")} volumeSemana={volumeSemana} treinosSemana={treinosSemana} />}
              {tab === "treino" && <TreinoTab plan={plan} dayIndex={dayIndex} setDayIndex={setDayIndex} onSwap={handleSwap} onFinish={handleFinishWorkout} profile={profile} onGenerateAI={handleGenerateWithAI} onShareWorkout={handleShareWorkout} onSavePhoto={handleSaveWorkoutPhoto} myCommunities={myCommunities} />}
              {tab === "dieta" && <DietaTab peso={profile.peso} objetivoPrincipal={profile.objetivo_principal} nivelAtividade={profile.nivel_atividade} dietaTipo={profile.dieta_tipo} meals={meals} waterMl={waterMl} onAddMeal={handleAddMeal} onRemoveMeal={handleRemoveMeal} onUpdateMealQty={handleUpdateMealQty} onSetMealQty={handleSetMealQty} onAddWater={handleAddWater} onRemoveWater={handleRemoveWater} aiSuggestions={aiDietSuggestions} onUseSuggestion={handleUseAISuggestion} onGenerateDietAI={handleGenerateDietWithAI} />}
              {tab === "comunidade" && <ComunidadeScreen userId={session.user.id} token={session.token} myProfile={{ id: session.user.id, nome: profile.nome, avatar_url: profile.avatar_url }} onShareWorkout={handleShareWorkout} onlineIds={onlineIds} hasUnreadDM={unreadCount > 0} />}
              {tab === "perfil" && <PerfilTab profile={{ ...profile, email: session.user.email }} email={session.user.email} token={session.token} streak={streak} trainedToday={trainedToday} freezes={freezes} onUseFreeze={handleUseFreeze} totalKg={totalKg} workoutCount={workoutLogs.length} onLogout={handleLogout} onSaveProfile={handleSaveProfile}
                exerciseLogs={exerciseLogs} bodyLogs={bodyLogs} workoutLogs={workoutLogs} weekMeals={weekMeals} metaKcal={metaKcal} onAddBodyLog={handleAddBodyLog}
                progressPhotos={progressPhotos} bodyLogCount={bodyLogs.length} messagesSentCount={messagesSentCount} communitiesJoinedCount={myCommunities.length}
              />}
            </div>

            <div style={{ position: "sticky", bottom: 0, left: 0, right: 0, background: hexToRgba(T.bg, 0.92), backdropFilter: "blur(10px)", borderTop: `1px solid ${T.line}`, display: "flex", padding: "10px 8px 14px" }}>
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: tab === t.id ? T.flame2 : T.steelDim }}>
                  <div style={{ position: "relative" }}>
                    <t.icon size={20} strokeWidth={tab === t.id ? 2.4 : 1.8} />
                    {t.id === "comunidade" && unreadCount > 0 && (
                      <span style={{
                        position: "absolute", top: -4, right: -7, minWidth: 14, height: 14, padding: "0 3px", borderRadius: 999,
                        background: T.red, color: "#fff", fontFamily: "Inter", fontWeight: 800, fontSize: 8.5,
                        display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${T.bg}`,
                      }}>{unreadCount > 9 ? "9+" : unreadCount}</span>
                    )}
                  </div>
                  <span style={{ fontFamily: "Inter", fontSize: 10, fontWeight: tab === t.id ? 700 : 500 }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showWelcome && <WelcomeModal nome={profile?.nome || nome || "atleta"} onClose={() => { setShowWelcome(false); setTab("treino"); }} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
