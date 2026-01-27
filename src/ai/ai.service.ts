import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RedisService } from '../cache/redis.service';
import { DeepseekProvider } from './providers/deepseek.provider';
import { OpenaiProvider } from './providers/openai.provider';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { HealthhubRequestDto, HealthhubResponseDto } from './dto/healthhub.dto';
import { SoapExpandRequestDto, SoapExpandResponseDto } from './dto/soap.dto';
import { v4 as uuidv4 } from 'uuid';
import {
  NotFoundException,
  RateLimitException,
  ExternalServiceException,
  BadRequestException,
} from '../common/exceptions';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private supabaseService: SupabaseService,
    private redisService: RedisService,
    private deepseekProvider: DeepseekProvider,
    private openaiProvider: OpenaiProvider,
  ) {}

  // ============================================
  // CHAT (Pawla) - Migrated from pawla-chat Edge Function
  // ============================================
  async chat(dto: ChatRequestDto, userId: string): Promise<ChatResponseDto> {
    const startTime = Date.now();
    const sessionId = dto.session_id || uuidv4();

    // Check rate limit
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:chat:${userId}`,
      50, // 50 requests
      3600, // per hour
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    // Get pet context if pet_id provided (parallel fetch for speed)
    let petContext = '';
    if (dto.pet_id) {
      // Check cache first
      const cached = await this.redisService.getCachedPetContext(dto.pet_id);
      if (cached) {
        petContext = JSON.stringify(cached);
      } else {
        // Parallel fetch - 3x faster than sequential
        const [pet, records, appointments] = await Promise.all([
          this.supabaseService.getPetContext(dto.pet_id),
          this.supabaseService.getPetMedicalRecords(dto.pet_id, 3), // Reduced from 5 to 3
          this.supabaseService.getPetAppointments(dto.pet_id, 2),   // Reduced from 3 to 2
        ]);
        
        const context = { pet, records, appointments };
        this.redisService.cachePetContext(dto.pet_id, context, 300); // Don't await cache write
        petContext = JSON.stringify(context);
      }
    }

    // Build system prompt
    const systemPrompt = this.buildChatSystemPrompt(petContext);

    // Handle image analysis if images provided
    if (dto.images && dto.images.length > 0) {
      const imageAnalysis = await this.openaiProvider.analyzeImage(
        dto.images[0],
        `Analyze this pet image and describe what you see. Focus on any health-related observations.`,
      );
      dto.message = `[Image Analysis: ${imageAnalysis.content}]\n\nUser question: ${dto.message}`;
    }

    // Call OpenAI GPT-4o-mini for chat (faster than DeepSeek)
    const aiStartTime = Date.now();
    const response = await this.openaiProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: dto.message },
      ],
      { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 500 },
    );
    
    const totalTime = Date.now() - startTime;
    const aiTime = Date.now() - aiStartTime;
    this.logger.log(`Chat completed: total=${totalTime}ms, ai=${aiTime}ms (OpenAI)`);

    return {
      response: response.content,
      session_id: sessionId,
      tokens_used: response.tokensUsed,
    };
  }

  private buildChatSystemPrompt(petContext: string): string {
    // Shortened prompt for faster response
    const basePrompt = `You are Pawla, a friendly AI vet assistant. Be helpful, empathetic, and recommend seeing a vet for serious concerns. Keep responses concise.`;
    
    if (petContext) {
      // Truncate context to reduce tokens
      const truncatedContext = petContext.length > 500 ? petContext.substring(0, 500) + '...' : petContext;
      return `${basePrompt}\n\nPet info: ${truncatedContext}`;
    }
    return basePrompt;
  }

  // ============================================
  // HEALTHHUB - Migrated from healthhub-analyze Edge Function
  // ============================================
  async analyzeHealth(dto: HealthhubRequestDto, userId: string): Promise<HealthhubResponseDto> {
    // Check rate limit
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:healthhub:${userId}`,
      10, // 10 requests
      3600, // per hour
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    // Check cache (unless force refresh)
    if (!dto.force_refresh) {
      const cached = await this.redisService.get(`healthhub:${dto.pet_id}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // Fetch pet data
    const pet = await this.supabaseService.getPetContext(dto.pet_id);
    const vaccinations = await this.supabaseService.getPetVaccinations(dto.pet_id);
    const medications = await this.supabaseService.getPetMedications(dto.pet_id);
    const records = await this.supabaseService.getPetMedicalRecords(dto.pet_id, 10);

    // Build analysis prompt
    const prompt = this.buildHealthAnalysisPrompt(pet, vaccinations, medications, records);

    // Call DeepSeek for analysis
    const response = await this.deepseekProvider.chatWithRetry(
      [
        { role: 'system', content: 'You are a veterinary health analyst. Respond ONLY with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3, maxTokens: 2000 },
    );

    // Parse response
    let analysis: HealthhubResponseDto;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch?.[0] || response.content);
      analysis.pet_id = dto.pet_id;
      analysis.generated_at = new Date().toISOString();
    } catch {
      throw new Error('Failed to parse health analysis response');
    }

    // Cache result for 24 hours
    await this.redisService.set(`healthhub:${dto.pet_id}`, JSON.stringify(analysis), 86400);

    return analysis;
  }

  private buildHealthAnalysisPrompt(pet: any, vaccinations: any[], medications: any[], records: any[]): string {
    return `Analyze the health status of this pet and provide a risk assessment.

PET INFO:
- Name: ${pet.name}
- Species: ${pet.species}
- Breed: ${pet.breed}
- Age: ${pet.age || 'Unknown'}
- Weight: ${pet.weight || 'Unknown'}

VACCINATIONS: ${JSON.stringify(vaccinations)}
MEDICATIONS: ${JSON.stringify(medications)}
RECENT RECORDS: ${JSON.stringify(records)}

Respond with JSON in this exact format:
{
  "risk_level": "low" | "medium" | "high",
  "overall_score": 0-100,
  "categories": [
    {
      "name": "Vaccinations",
      "score": 0-100,
      "status": "up-to-date" | "due-soon" | "overdue",
      "recommendations": ["..."]
    }
  ],
  "summary": "Brief overall health summary"
}`;
  }

  // ============================================
  // SOAP EXPAND - Migrated from soap-expand Edge Function
  // ============================================
  async expandSoap(dto: SoapExpandRequestDto, userId: string): Promise<SoapExpandResponseDto> {
    // Check rate limit
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:soap:${userId}`,
      30, // 30 requests
      3600, // per hour
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    const supabase = this.supabaseService.getClient();

    // Fetch appointment and SOAP data
    const { data: appointment, error } = await supabase
      .from('appointments')
      .select('*, pets(*)')
      .eq('id', dto.appointment_id)
      .single();

    if (error || !appointment) {
      this.logger.warn(`Appointment not found: ${dto.appointment_id}`);
      throw new NotFoundException('Appointment', dto.appointment_id);
    }

    // Build expansion prompt
    const prompt = this.buildSoapExpansionPrompt(appointment, dto.current_data, dto.section);

    // Call DeepSeek for expansion
    const response = await this.deepseekProvider.chatWithRetry(
      [
        { role: 'system', content: 'You are a veterinary SOAP note assistant. Expand the provided notes professionally.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, maxTokens: 2000 },
    );

    // Parse response
    let expanded: any;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      expanded = JSON.parse(jsonMatch?.[0] || response.content);
    } catch {
      // If not JSON, treat as plain text expansion
      expanded = { [dto.section || 'all']: response.content };
    }

    // Create snapshot for undo
    const snapshotId = uuidv4();
    await supabase.from('soap_snapshots').insert({
      id: snapshotId,
      appointment_id: dto.appointment_id,
      snapshot_data: dto.current_data,
      created_by: userId,
    });

    return {
      appointment_id: dto.appointment_id,
      expanded,
      snapshot_id: snapshotId,
    };
  }

  private buildSoapExpansionPrompt(appointment: any, currentData: any, section?: string): string {
    return `Expand the following SOAP notes for a veterinary appointment.

PET: ${appointment.pets?.name} (${appointment.pets?.species}, ${appointment.pets?.breed})
APPOINTMENT TYPE: ${appointment.service_type}

CURRENT NOTES:
${JSON.stringify(currentData || {}, null, 2)}

${section ? `Focus on expanding the "${section}" section.` : 'Expand all sections.'}

Respond with JSON containing the expanded sections:
{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "..."
}`;
  }

  // ============================================
  // FOOD SCAN - Analyze food safety for pets
  // ============================================
  async analyzeFoodScan(dto: any, userId: string): Promise<any> {
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:foodscan:${userId}`,
      20,
      3600,
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    const supabase = this.supabaseService.getClient();

    // Get pet context
    const { data: pet, error: petError } = await supabase
      .from('pets')
      .select('id, client_id, name, species, breed, weight')
      .eq('id', dto.pet_id)
      .single();

    if (petError || !pet) {
      throw new NotFoundException('Pet', dto.pet_id);
    }

    const startTime = Date.now();
    const systemPrompt = this.buildFoodScanSystemPrompt();
    const userPrompt = this.buildFoodScanUserPrompt(dto, pet);

    const response = await this.openaiProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 1200 },
    );

    const latency = Date.now() - startTime;
    let result: any;
    try {
      result = JSON.parse(response.content);
    } catch {
      throw new BadRequestException('Failed to parse AI response');
    }

    // Store scan in database
    const { data: scan, error: scanError } = await supabase
      .from('food_scans')
      .insert({
        client_id: pet.client_id,
        pet_id: dto.pet_id,
        food_name: result.food_name || dto.food_name,
        food_type: result.food_type || dto.food_type,
        scan_type: result.scan_type || dto.scan_type || 'food_item',
        model_used: 'gpt-4o-mini',
        ai_response: result,
        safety_rating: result.safety_rating,
        toxicity_score: result.toxicity_score,
        ingredients: result.ingredients || [],
        toxic_ingredients: result.toxic_ingredients || [],
        nutritional_value: result.nutritional_value,
        recommended_serving: result.recommended_serving,
        warnings: result.warnings || [],
        health_benefits: result.health_benefits,
        status: 'completed',
        latency_ms: latency,
      })
      .select('id')
      .single();

    if (scanError) {
      this.logger.error('Failed to store food scan', scanError);
    }

    return {
      scan_id: scan?.id,
      analysis: result,
      latency_ms: latency,
      model: 'gpt-4o-mini',
    };
  }

  private buildFoodScanSystemPrompt(): string {
    return `You are FoodScan AI, a pet food safety expert. Analyze if food is safe for pets.

OUTPUT: Return strict JSON:
{
  "food_name": "identified food",
  "food_type": "kibble|wet_food|raw|treat|human_food|supplement|other",
  "scan_type": "label|food_item|package",
  "safety_rating": "safe|caution|toxic|unknown",
  "toxicity_score": 0-10 (0=safe, 10=toxic),
  "ingredients": [{"name": "string", "is_toxic": boolean, "severity": 1-10, "notes": "string"}],
  "toxic_ingredients": [{"name": "string", "severity": 1-10, "symptoms": "string", "action_required": "immediate_vet|monitor_closely|avoid_future"}],
  "nutritional_value": {"protein_percent": number, "fat_percent": number, "quality_rating": "excellent|good|fair|poor|unknown", "notes": "string"},
  "recommended_serving": {"safe_to_give": boolean, "serving_size": "string", "frequency": "string", "notes": "string"},
  "warnings": [{"level": "critical|warning|info", "message": "string"}],
  "health_benefits": "string or null",
  "confidence": 0-100,
  "notes": "string"
}

TOXIC: Chocolate, grapes, raisins, onions, garlic, xylitol, macadamia nuts, alcohol, caffeine
CAUTION: Dairy, raw eggs, raw meat, bones, high-fat foods
SAFE: Plain cooked chicken, carrots, apples (no seeds), blueberries, rice, pumpkin`;
  }

  private buildFoodScanUserPrompt(dto: any, pet: any): string {
    return `FOOD SAFETY ANALYSIS

PET: ${pet.name} (${pet.species}, ${pet.breed}, ${pet.weight}kg)

FOOD:
- Name: ${dto.food_name || 'Analyze from description'}
- Type: ${dto.food_type || 'Unknown'}

Analyze if this food is safe for this pet. Return JSON only.`;
  }

  // ============================================
  // PAWSCAN - Symptom triage analysis
  // ============================================
  async analyzePawScan(dto: any, userId: string): Promise<any> {
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:pawscan:${userId}`,
      15,
      3600,
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    // Handle treatment generation mode
    if (dto.mode === 'generate_treatment' && dto.session_id) {
      return this.generatePawScanTreatment(dto.session_id, userId);
    }

    const supabase = this.supabaseService.getClient();

    // Get pet context
    const { data: pet, error: petError } = await supabase
      .from('pets')
      .select('id, client_id, name, species, breed, sex, weight, birth_date')
      .eq('id', dto.pet_id)
      .single();

    if (petError || !pet) {
      throw new NotFoundException('Pet', dto.pet_id);
    }

    const startTime = Date.now();
    const systemPrompt = this.buildPawScanSystemPrompt();
    const userPrompt = this.buildPawScanUserPrompt(dto.answers, pet);

    const response = await this.openaiProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 1000 },
    );

    const latency = Date.now() - startTime;
    let result: any;
    try {
      result = JSON.parse(response.content);
    } catch {
      throw new BadRequestException('Failed to parse AI response');
    }

    // Ensure severity fields exist
    const score = result.severity_score;
    if (!result.vet_action && typeof score === 'number') {
      if (score >= 4.1) result.vet_action = 'urgent_care';
      else if (score >= 3.1) result.vet_action = 'see_vet';
      else result.vet_action = 'monitor';
    }
    if (!result.severity_label && typeof score === 'number') {
      if (score >= 4.1) result.severity_label = 'critical';
      else if (score >= 3.1) result.severity_label = 'high';
      else if (score >= 2.1) result.severity_label = 'medium';
      else result.severity_label = 'low';
    }

    // Store session
    const { data: session, error: sessionError } = await supabase
      .from('pawscan_sessions')
      .insert({
        client_id: pet.client_id,
        pet_id: dto.pet_id,
        model_used: 'gpt-4o-mini',
        prompt: dto.answers,
        ai_response: result,
        severity: result.severity_label,
        severity_score: result.severity_score,
        severity_label: result.severity_label,
        vet_action: result.vet_action,
        diagnosis: result.diagnosis,
        prognosis: result.prognosis,
        recommendations: result.recommendations || [],
        status: 'completed',
        latency_ms: latency,
        risk_flags: result.risk_flags || [],
      })
      .select('id')
      .single();

    if (sessionError) {
      this.logger.error('Failed to store pawscan session', sessionError);
    }

    return {
      session_id: session?.id,
      severity_score: result.severity_score,
      severity_label: result.severity_label,
      vet_action: result.vet_action,
      triage: result.triage,
      diagnosis: result.diagnosis,
      prognosis: result.prognosis,
      recommendations: result.recommendations,
      risk_flags: result.risk_flags,
      confidence_score: result.confidence_score,
      model_used: 'gpt-4o-mini',
      latency_ms: latency,
    };
  }

  private async generatePawScanTreatment(sessionId: string, userId: string): Promise<any> {
    const supabase = this.supabaseService.getClient();

    const { data: session, error } = await supabase
      .from('pawscan_sessions')
      .select('*, pets(name, species, breed, sex, weight, birth_date)')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new NotFoundException('PawScan session', sessionId);
    }

    if (session.treatment_guide) {
      return { treatment_guide: session.treatment_guide, cached: true };
    }

    const startTime = Date.now();
    const prompt = `TREATMENT GUIDE REQUEST

PET: ${session.pets?.name} (${session.pets?.species}, ${session.pets?.breed})

ASSESSMENT:
- Severity: ${session.severity_label} (${session.severity_score}/5.0)
- Action: ${session.vet_action}
- Diagnosis: ${session.diagnosis}

Generate practical home care guidance. Return JSON:
{
  "treatment_guide": {
    "medications": [{"name": "string", "description": "string"}],
    "natural_remedies": [{"remedy": "string", "description": "string"}],
    "dietary_recommendations": ["string"],
    "preventive_measures": ["string"],
    "lifestyle_modifications": ["string"]
  }
}`;

    const response = await this.openaiProvider.chat(
      [
        { role: 'system', content: 'You are a veterinary treatment guide specialist. Provide safe home care guidance.' },
        { role: 'user', content: prompt },
      ],
      { model: 'gpt-4o-mini', temperature: 0.5, maxTokens: 800 },
    );

    const latency = Date.now() - startTime;
    let result: any;
    try {
      result = JSON.parse(response.content);
    } catch {
      throw new BadRequestException('Failed to parse treatment response');
    }

    const treatmentGuide = result.treatment_guide || {};

    await supabase
      .from('pawscan_sessions')
      .update({
        treatment_guide: treatmentGuide,
        treatment_guide_generated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    return {
      treatment_guide: treatmentGuide,
      latency_ms: latency,
      model_used: 'gpt-4o-mini',
    };
  }

  private buildPawScanSystemPrompt(): string {
    return `You are PawScan AI, a veterinary triage assistant. Analyze pet symptoms and provide guidance.

OUTPUT: Return strict JSON:
{
  "severity_score": 1.0-5.0,
  "severity_label": "low|medium|high|critical",
  "vet_action": "monitor|see_vet|urgent_care",
  "triage": "2-3 sentences, empathetic",
  "diagnosis": "2-4 sentences, likely possibilities",
  "prognosis": "2-4 sentences, what to expect",
  "recommendations": ["1-3 next steps"],
  "risk_flags": ["0-4 warning signs"],
  "confidence_score": 0-1
}

Severity: 1-2=low/monitor, 2.1-3=medium, 3.1-4=high/see_vet, 4.1-5=critical/urgent_care`;
  }

  private buildPawScanUserPrompt(answers: any, pet: any): string {
    return `SYMPTOM ANALYSIS

PET: ${pet.name} (${pet.species}, ${pet.breed}, ${pet.sex}, ${pet.weight}kg)

COMPLAINT: ${answers?.complaint || answers?.symptoms || 'Not specified'}
STARTED: ${answers?.when_started || answers?.duration || 'Unknown'}
APPETITE: ${answers?.appetite || 'Unknown'}
ENERGY: ${answers?.energy_level || 'Unknown'}
WORSENING: ${answers?.getting_worse ? 'Yes' : 'No'}
OTHER: ${answers?.other_symptoms?.join(', ') || 'None'}

Analyze and return JSON only.`;
  }

  // ============================================
  // NUTRITION - Generate nutrition plans
  // ============================================
  async analyzeNutrition(dto: any, userId: string): Promise<any> {
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:nutrition:${userId}`,
      10,
      3600,
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    const supabase = this.supabaseService.getClient();

    // Get pet and preferences
    const [petResult, prefResult] = await Promise.all([
      supabase.from('pets').select('*').eq('id', dto.pet_id).single(),
      supabase.from('pet_nutrition_preferences').select('*').eq('id', dto.preference_id).single(),
    ]);

    if (petResult.error || !petResult.data) {
      throw new NotFoundException('Pet', dto.pet_id);
    }
    if (prefResult.error || !prefResult.data) {
      throw new NotFoundException('Nutrition preferences', dto.preference_id);
    }

    const pet = petResult.data;
    const prefs = prefResult.data;

    const startTime = Date.now();
    const prompt = this.buildNutritionPrompt(pet, prefs);

    const response = await this.openaiProvider.chat(
      [
        { role: 'system', content: 'You are a veterinary nutrition AI. Create personalized nutrition plans. Return JSON only.' },
        { role: 'user', content: prompt },
      ],
      { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 1500 },
    );

    const latency = Date.now() - startTime;
    let result: any;
    try {
      result = JSON.parse(response.content);
    } catch {
      throw new BadRequestException('Failed to parse nutrition response');
    }

    return {
      success: true,
      data: result,
      latency_ms: latency,
      model: 'gpt-4o-mini',
    };
  }

  private buildNutritionPrompt(pet: any, prefs: any): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    return `NUTRITION PLAN REQUEST

PET: ${pet.name} (${pet.species}, ${pet.breed})
- Age: ${age}
- Weight: ${pet.weight || 'Unknown'} lbs
- Allergies: ${pet.allergies || 'None'}

PREFERENCES:
- Diet: ${prefs.diet_style || 'Not specified'}
- Goal: ${prefs.goal || 'maintain'}
- Budget: ${prefs.budget_preference || 'Not specified'}

Create a nutrition plan. Return JSON:
{
  "calorie_target_per_day": number,
  "meal_plan": {"meals_per_day": number, "meals": [{"time_of_day": "morning|evening", "portion_size_description": "string", "composition": "string"}]},
  "recommended_food_types": {"kibble": ["string"] or null, "raw": {"proteins": [], "veggies": [], "grains": [], "oils": []} or null},
  "treat_guidelines": {"daily_amount": "string", "types": ["string"]},
  "transition_plan": {"duration_days": number, "schedule": "string"},
  "special_considerations": "string",
  "red_flag_foods": ["string"]
}`;
  }

  // ============================================
  // TRAINING - Generate training plans
  // ============================================
  async analyzeTraining(dto: any, userId: string): Promise<any> {
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:training:${userId}`,
      10,
      3600,
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    const supabase = this.supabaseService.getClient();

    const [petResult, prefResult] = await Promise.all([
      supabase.from('pets').select('*').eq('id', dto.pet_id).single(),
      supabase.from('pet_training_preferences').select('*').eq('id', dto.preference_id).single(),
    ]);

    if (petResult.error || !petResult.data) {
      throw new NotFoundException('Pet', dto.pet_id);
    }
    if (prefResult.error || !prefResult.data) {
      throw new NotFoundException('Training preferences', dto.preference_id);
    }

    const pet = petResult.data;
    const prefs = prefResult.data;

    const startTime = Date.now();
    const prompt = this.buildTrainingPrompt(pet, prefs);

    const response = await this.openaiProvider.chat(
      [
        { role: 'system', content: 'You are a veterinary behavior and training AI. Create positive reinforcement training plans. Return JSON only.' },
        { role: 'user', content: prompt },
      ],
      { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 2000 },
    );

    const latency = Date.now() - startTime;
    let result: any;
    try {
      result = JSON.parse(response.content);
    } catch {
      throw new BadRequestException('Failed to parse training response');
    }

    return {
      success: true,
      data: result,
      latency_ms: latency,
      model: 'gpt-4o-mini',
    };
  }

  private buildTrainingPrompt(pet: any, prefs: any): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    return `TRAINING PLAN REQUEST

PET: ${pet.name} (${pet.species}, ${pet.breed})
- Age: ${age}
- Weight: ${pet.weight || 'Unknown'} lbs

PREFERENCES:
- Behavior Issues: ${prefs.behavior_issues?.join(', ') || 'Not specified'}
- Goals: ${prefs.training_goals?.join(', ') || 'Not specified'}
- Experience: ${prefs.experience_level || 'beginner'}
- Time: ${prefs.time_commitment_minutes || 15} min/day

Create a 4-week training plan. Return JSON:
{
  "summary": "2-3 sentences",
  "difficulty_level": "easy|medium|hard",
  "safety_notes": "string",
  "primary_behaviors": ["string"],
  "overall_metrics": ["string"],
  "weekly_plan": [
    {
      "week_number": 1,
      "focus": "string",
      "daily_sessions": [
        {"day_label": "Session 1", "exercise_name": "string", "steps": ["string"], "estimated_time_minutes": number, "tracking_metrics": ["string"]}
      ]
    }
  ]
}`;
  }

  // ============================================
  // GROOMING - Generate grooming plans
  // ============================================
  async analyzeGrooming(dto: any, userId: string): Promise<any> {
    const rateLimit = await this.redisService.checkRateLimit(
      `rate:grooming:${userId}`,
      5,
      3600,
    );
    if (!rateLimit.allowed) {
      throw new RateLimitException();
    }

    const supabase = this.supabaseService.getClient();

    const { data: pet, error } = await supabase
      .from('pets')
      .select('id, name, species, breed, sex, weight, birth_date, allergies')
      .eq('id', dto.pet_id)
      .single();

    if (error || !pet) {
      throw new NotFoundException('Pet', dto.pet_id);
    }

    const category = dto.category || 'full_plan';
    const startTime = Date.now();
    const prompt = this.buildGroomingPrompt(pet, category);

    const response = await this.openaiProvider.chat(
      [
        { role: 'system', content: 'You are a professional pet grooming expert. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 1500 },
    );

    const latency = Date.now() - startTime;
    let result: any;
    try {
      let cleaned = response.content.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      result = JSON.parse(cleaned.trim());
    } catch {
      throw new BadRequestException('Failed to parse grooming response');
    }

    return {
      success: true,
      data: result,
      pet: { id: pet.id, name: pet.name, breed: pet.breed, species: pet.species },
      latency_ms: latency,
    };
  }

  private buildGroomingPrompt(pet: any, category: string): string {
    const age = pet.birth_date ? this.calculateAge(pet.birth_date) : 'Unknown';
    const isFullPlan = category === 'full_plan';

    return `GROOMING PLAN REQUEST

PET: ${pet.name} (${pet.species}, ${pet.breed})
- Age: ${age}
- Weight: ${pet.weight || 'Unknown'} lbs
- Allergies: ${pet.allergies || 'None'}

${isFullPlan ? 'Generate a COMPLETE grooming plan for all categories.' : `Generate plan for: ${category.replace(/_/g, ' ')}`}

Return JSON:
${isFullPlan ? `{
  "category": "full_plan",
  "haircut_and_bath": {"category": "haircut_and_bath", "frequency": "string", "method": "string", "products": ["string"], "tips": ["string"], "warning_signs": ["string"], "breed_specific_notes": "string"},
  "nails": {"category": "nails", "frequency": "string", "method": "string", "products": ["string"], "tips": ["string"], "warning_signs": ["string"], "breed_specific_notes": "string"},
  "dental": {"category": "dental", "frequency": "string", "method": "string", "products": ["string"], "tips": ["string"], "warning_signs": ["string"], "breed_specific_notes": "string"},
  "ears": {"category": "ears", "frequency": "string", "method": "string", "products": ["string"], "tips": ["string"], "warning_signs": ["string"], "breed_specific_notes": "string"}
}` : `{
  "category": "${category}",
  "frequency": "string",
  "method": "string",
  "products": ["string"],
  "tips": ["string"],
  "warning_signs": ["string"],
  "breed_specific_notes": "string"
}`}`;
  }

  private calculateAge(birthDate: string): string {
    const birth = new Date(birthDate);
    const now = new Date();
    const years = now.getFullYear() - birth.getFullYear();
    const months = now.getMonth() - birth.getMonth();
    if (years < 1) return `${Math.max(0, years * 12 + months)} months`;
    return `${years} year${years > 1 ? 's' : ''}`;
  }
}
