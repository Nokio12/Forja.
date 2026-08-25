// supabase/functions/generate-plan/index.ts
//
// Edge Function que recebe o perfil completo do onboarding e chama a API
// gratuita do Google Gemini (gemini-3.5-flash) usando response_schema
// (JSON estrito) para retornar, num único payload: o plano de treino
// semanal E sugestões de dieta por horário de refeição.
//
// A GEMINI_API_KEY nunca é exposta ao navegador — fica só aqui,
// como secret do Supabase.

const EQUIP_LABEL: Record<string, string> = {
  completa: "Academia comercial completa (máquinas, cabos, pesos livres)",
  basica: "Academia básica de condomínio (halteres, barras, aparelhos limitados)",
  casa: "Em casa / Calistenia (peso corporal ou elásticos)",
};
const OBJ_LABEL: Record<string, string> = {
  hipertrofia: "Hipertrofia (ganho de massa muscular)",
  emagrecimento: "Emagrecimento (perda de gordura)",
  condicionamento: "Condicionamento físico e saúde geral",
  forca: "Aumento de força (powerlifting / performance)",
};
const NIVEL_LABEL: Record<string, string> = {
  iniciante: "Iniciante (menos de 3 meses de treino)",
  intermediario: "Intermediário (mais de 6 meses, conhece a execução dos exercícios)",
  avancado: "Avançado (mais de 2 anos, busca quebras de platô)",
};
const TEMPO_LABEL: Record<string, string> = {
  ate30: "Até 30 minutos (treino rápido/express)",
  "45a60": "45 a 60 minutos",
  "1ha1h30": "1 hora a 1 hora e meia",
  mais1h30: "Mais de 1h30",
};
const LESAO_LABEL: Record<string, string> = {
  nenhuma: "Nenhuma restrição",
  joelhos: "Dor ou lesão nos joelhos — evitar agachamento profundo/impacto",
  lombar: "Dor ou lesão lombar — evitar flexão de coluna sob carga",
  ombros_punhos: "Dor ou lesão em ombros/punhos — evitar overhead e apoio de punho",
  outra: "Outra restrição articular ou postural — priorizar exercícios de baixo impacto",
};
const FOCO_LABEL: Record<string, string> = {
  corpo_inteiro: "Corpo inteiro / harmonioso, sem prioridade",
  superior: "Membros superiores (peito, costas, braços, ombros)",
  inferior: "Membros inferiores (glúteos, quadríceps, posteriores)",
  core: "Abdômen e core",
};
const DIETA_LABEL: Record<string, string> = {
  nenhuma: "Sem restrição alimentar, come de tudo",
  flexivel: "Dieta flexível / contagem de macros",
  vegetariana: "Vegetariana ou vegana — nenhuma sugestão pode conter carne, peixe ou frango",
  lowcarb: "Low carb / cetogênica — priorizar baixo carboidrato",
};

// Schema no formato aceito pelo Gemini (tipos em maiúsculo)
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    treinos: {
      type: "ARRAY",
      description: "Um item por dia de treino da semana.",
      items: {
        type: "OBJECT",
        properties: {
          nome: { type: "STRING" },
          exercicios: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                nome: { type: "STRING" },
                series: { type: "INTEGER" },
                reps: { type: "STRING" },
                grupo: { type: "STRING", enum: ["peito", "costas", "pernas", "ombro", "bracos", "core"] },
              },
              required: ["nome", "series", "reps", "grupo"],
            },
          },
        },
        required: ["nome", "exercicios"],
      },
    },
    dieta: {
      type: "ARRAY",
      description: "Uma sugestão de refeição para cada horário do dia.",
      items: {
        type: "OBJECT",
        properties: {
          slot: { type: "STRING", enum: ["cafe", "almoco", "pre_treino", "jantar"] },
          sugestao: { type: "STRING", description: "Descrição curta do prato/alimentos sugeridos" },
          kcal: { type: "NUMBER" },
          proteina: { type: "NUMBER" },
          carboidrato: { type: "NUMBER" },
          gordura: { type: "NUMBER" },
        },
        required: ["slot", "sugestao", "kcal", "proteina", "carboidrato", "gordura"],
      },
    },
  },
  required: ["treinos", "dieta"],
};

function buildPrompt(p: Record<string, any>) {
  return `Você é um personal trainer e nutricionista esportivo montando um plano individualizado.

Perfil completo do aluno:
- Nível de experiência: ${NIVEL_LABEL[p.nivel_experiencia] || p.nivel_experiencia}
- Objetivo principal: ${OBJ_LABEL[p.objetivo_principal] || p.objetivo_principal}
- Dias disponíveis por semana: ${p.dias_semana}
- Tempo por sessão: ${TEMPO_LABEL[p.tempo_categoria] || p.tempo_categoria}
- Equipamento disponível: ${EQUIP_LABEL[p.equipamento] || p.equipamento}
- Restrição física / lesão: ${LESAO_LABEL[p.lesao_regiao] || p.lesao_regiao}
- Foco muscular prioritário: ${FOCO_LABEL[p.foco_muscular] || p.foco_muscular}
- Faixa etária: ${p.faixa_etaria || "não informada"}
- Nível de atividade diária fora da academia: ${p.nivel_atividade || "não informado"}
- Restrição alimentar: ${DIETA_LABEL[p.dieta_tipo] || p.dieta_tipo || "nenhuma"}
- Peso: ${p.peso ?? "?"} kg, altura: ${p.altura ?? "?"} cm

TREINO: monte exatamente ${p.dias_semana} treinos (um por dia de treino da semana), com exercícios reais e apropriados para o equipamento disponível, volume de séries coerente com o nível de experiência (iniciante = mais conservador, avançado = maior volume/intensidade), evitando qualquer exercício que sobrecarregue a restrição física informada. Se o foco muscular não for "corpo inteiro", dê 1-2 exercícios a mais para os grupos priorizados. Use nomes de exercícios em português.

DIETA: sugira uma refeição para cada um dos 4 horários do dia (cafe, almoco, pre_treino, jantar), coerente com o objetivo, peso e restrição alimentar informados, com valores nutricionais realistas. Respeite rigorosamente a restrição alimentar.

Responda apenas com o JSON estruturado.`;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { params } = await req.json();
    if (!params) throw new Error("Parâmetros do perfil não enviados.");

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no servidor.");

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(params) }] }],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: RESPONSE_SCHEMA,
            temperature: 0.6,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      throw new Error(`Erro da API Gemini (${geminiRes.status}): ${errBody}`);
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("A IA não retornou conteúdo. Tente novamente.");

    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { throw new Error("A IA retornou um formato inesperado."); }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});