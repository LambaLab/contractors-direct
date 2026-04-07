import type Anthropic from '@anthropic-ai/sdk'

export const UPDATE_PROPOSAL_TOOL: Anthropic.Tool = {
  name: 'update_proposal',
  description:
    'Called by the AI after every turn to update the detected scope, confidence score, price adjustment, brief, and project overview. Always call this tool alongside the conversational response.',
  cache_control: { type: 'ephemeral' },
  input_schema: {
    type: 'object' as const,
    properties: {
      // follow_up_question MUST be first. The server extracts it from the
      // streaming JSON delta and forwards it to the client as live text events
      // so the user sees the reaction immediately without waiting for the full JSON.
      follow_up_question: {
        type: 'string',
        description: 'Reaction and insight for this turn, NOT the question. Two paragraphs max, separated by a blank line. Paragraph 1: 1-sentence reaction, specific to what they said. Paragraph 2: 1-2 sentence insight (comparable product, tension, tradeoff). Skip paragraph 2 only for very vague inputs with nothing to riff on. Do NOT include the question here. Put it in the question field instead.',
      },
      // transition_text is OPTIONAL. Only set when pivoting to a new topic area.
      // When present and non-empty, the server streams it into a second chat bubble
      // (via bubble_split event) so topic transitions appear as visually distinct
      // messages rather than being buried inside the reaction paragraph.
      transition_text: {
        type: 'string',
        description: 'Only set when pivoting to a new topic area for the first time (e.g. moving from scope to budget, or from layout to finishes). 1-2 sentences max. Reference specific facts the user already stated, use their exact words or numbers (e.g. "you mentioned a 3-bedroom villa", "since you\'re going with a full kitchen remodel"). Write it as a natural spoken bridge: acknowledge where we just were and orient toward the new territory. Leave as an empty string ("") when staying within the same topic, or when no prior-stated facts are relevant. Never use it for generic transitions like "Now let\'s talk about..." with no callback to their own words. Always leave as "" on suggest_pause turns.',
      },
      // suggest_pause MUST come before question/quick_replies. The server checks it
      // before emitting a partial_result event. When true, partial_result is suppressed
      // so the reaction bubble doesn't receive checkpoint QRs prematurely; the pause
      // checkpoint is created separately in tool_result.
      suggest_pause: {
        type: 'boolean' as const,
        description: 'Set to true when confidence is 60%+ and you have covered: property type, location, size, condition, and at least 2 scope items in detail. Can fire multiple times as the conversation deepens, for example at 60% and again at 80%. Never trigger two checkpoints back-to-back; wait at least 4 turns between them.',
      },
      suggest_resume: {
        type: 'boolean' as const,
        description: 'Only used during paused mode. Set to true when the user has clearly agreed to resume the structured Q&A (e.g. "yes", "sure", "let\'s continue", "ok"). Do NOT set on the turn where you suggest resuming, only on the turn where the user confirms.',
      },
      // question and quick_replies MUST come after suggest_pause so the server always
      // knows whether this is a pause turn before partial_result fires.
      // They also MUST come before the heavy metadata fields (project_overview,
      // scope_summaries). Placing them early eliminates a 5-7 second delay where
      // the user would otherwise see nothing after the text stops streaming.
      question: {
        type: 'string',
        description: 'REQUIRED every turn. Never empty. Ends with ?. On normal turns: one crisp question sentence, the user\'s call to action. On suggest_pause turns: 2-4 sentences covering what\'s been established (use the user\'s exact words/numbers), note that progress is saved, then close with a warm invitation to review, continue, or save.',
      },
      quick_replies: {
        type: 'object' as const,
        description: 'Include on almost every turn (see system prompt). For open-ended or numeric questions, provide 2-3 example options with allowCustom: true so users have a starting point. Every option MUST include an icon (single emoji).',
        properties: {
          style: {
            type: 'string' as const,
            enum: ['list', 'pills'],
            description: 'list = numbered items with descriptions (default for most decisions). pills = compact chips (simple/short answers like yes/no or platform choice).',
          },
          multiSelect: {
            type: 'boolean' as const,
            description: 'true if the user can pick multiple answers (e.g. "which scope items do you need?")',
          },
          allowCustom: {
            type: 'boolean' as const,
            description: 'For list style, always set to true unless options are truly exhaustive. Adds a "Type something else..." row at the bottom.',
          },
          options: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                label: { type: 'string' as const, description: 'Short bold label (5 words max)' },
                description: { type: 'string' as const, description: 'Subtitle for list style only (12 words max)' },
                icon: { type: 'string' as const, description: 'Single emoji that represents this option. Required for every option.' },
                value: { type: 'string' as const, description: 'Text sent as user message when tapped' },
              },
              required: ['label', 'value', 'icon'],
            },
          },
        },
        required: ['style', 'options'],
      },
      detected_scope: {
        type: 'array',
        items: { type: 'string' },
        description: 'COMPLETE cumulative list of ALL scope item IDs detected so far across the entire conversation. Always include every previously detected scope item plus any new ones this turn.',
      },
      confidence_score_delta: {
        type: 'number',
        minimum: -20,
        maximum: 10,
        description: 'Change to confidence score this turn (positive or negative, integer). Maximum +10 per turn, do not exceed this even if a lot was learned. Range -20 to 10.',
      },
      complexity_multiplier: {
        type: 'number',
        minimum: 0.5,
        maximum: 2.0,
        description: 'Complexity adjustment multiplier (0.5-2.0). 1.0 = no change. Use >1 for complex, <1 for simple.',
      },
      property_type: {
        type: 'string',
        enum: ['villa', 'apartment', 'townhouse', 'penthouse', 'office', ''],
        description: 'Type of property being renovated. Empty string if not yet known.',
      },
      location: {
        type: 'string',
        description: 'UAE area/community (e.g. Dubai Marina, JBR, Arabian Ranches, Al Reem Island). Empty string if not yet known.',
      },
      size_sqft: {
        type: 'number',
        description: 'Property size in square feet. 0 if not yet known.',
      },
      condition: {
        type: 'string',
        enum: ['new', 'needs_refresh', 'major_renovation', 'shell', ''],
        description: 'Current condition of the property. Empty string if not yet known.',
      },
      style_preference: {
        type: 'string',
        description: 'Chosen aesthetic style from the 8 style cards (Modern, Contemporary Arabic, Scandinavian, Industrial, Classic, Maximalist, Coastal, Minimalist). Empty string if not yet chosen.',
      },
      updated_brief: {
        type: 'string',
        description: 'Concise 2-4 sentence brief of the renovation project as understood so far.',
      },
      project_name: {
        type: 'string',
        description: '2-4 word name derived from property type, location, or renovation scope. Examples: \'Marina Apartment Refresh\', \'Villa Full Renovation\', \'JBR Kitchen Remodel\'. Update every turn.',
      },
      project_overview: {
        type: 'string',
        description: 'Project description for a non-technical client or project manager. No jargon. Only update when meaningful new information was learned this turn. If nothing significant changed, return an empty string (the previous overview is preserved automatically). When updating, never shorten existing content, only expand. Turn 1-2: 1-2 sentences. Turn 3-4: One 3-5 sentence paragraph. Turn 5+: Use labeled sections with a blank line between each. 2-3 sentences per section. Available labels: "What it is", "Who it\'s for", "How it works", "Key scope", "Budget" (only if known), "Why it matters" (only if competitive angle is clear). Skip sections with no real information. Be specific, every sentence must reflect what was actually discussed.',
      },
      scope_summaries: {
        type: 'object' as const,
        description:
          'Optional. Only include entries for scope items that were newly detected or had their details meaningfully clarified this turn. Previously established summaries are preserved automatically, omit unchanged scope items. Keys are scope item IDs (e.g. "kitchen", "bathrooms"). Values are 1-2 plain sentences specific to this project, no markdown.',
        additionalProperties: { type: 'string' as const },
      },
      // Phase tracking fields — drive the 3-phase conversation structure
      current_phase: {
        type: 'string' as const,
        enum: ['discovery', 'deep_dive', 'wrap_up'],
        description: 'Current conversation phase. discovery = broad questions (turns 1-5). deep_dive = focused per-scope-item questions. wrap_up = final recap.',
      },
      current_scope: {
        type: 'string',
        description: 'Scope item ID currently being deep-dived (e.g. "kitchen"). Empty string in discovery and wrap_up phases.',
      },
      scope_complete: {
        type: 'boolean' as const,
        description: 'Set to true on the turn that finishes a scope item deep-dive. Triggers a scope-complete divider with summary and action pills in the UI.',
      },
      scope_queue: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ordered list of scope item IDs remaining to deep-dive (current scope item at index 0). Updated each turn during deep_dive phase. Empty in discovery and wrap_up.',
      },
    },
    required: ['follow_up_question', 'detected_scope', 'confidence_score_delta', 'question', 'current_phase'],
  },
}
