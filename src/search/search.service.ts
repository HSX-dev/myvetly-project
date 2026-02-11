import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserContext } from '../auth/auth.guard';
import { SearchQueryDto, SearchResult } from './dto/search.dto';

@Injectable()
export class SearchService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Perform global search across clients, pets, and users
   * Matches the original frontend search behavior
   */
  async search(query: string, user: UserContext): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    if (!user.clinic_id) {
      return [];
    }

    const searchQuery = query.trim();
    const normalized = this.normalizeQuery(searchQuery);
    const isPhone = this.isPhoneQuery(normalized);
    const isEmail = this.isEmailQuery(searchQuery);
    const searchTerm = `%${searchQuery}%`;
    const results: SearchResult[] = [];

    try {
      // Check permissions - clients cannot view other clients (matches original frontend logic)
      const canViewClients = user.role !== 'client';
      
      // Search clients by name, email, or phone
      if (!canViewClients) {
        // If user is a client, they cannot search for other clients
        // Return empty results for client search, but still allow pet search if applicable
      }
      
      let clientQuery = canViewClients
        ? this.supabaseService
            .getClient()
            .from('clients')
            .select('id, phone, user_id')
            .eq('clinic_id', user.clinic_id)
            .limit(15)
        : null;

      if (isPhone && clientQuery) {
        const phoneDigits = searchQuery.replace(/\D/g, '');
        if (phoneDigits.length > 0) {
          clientQuery = clientQuery.ilike('phone', `%${phoneDigits}%`);
        } else {
          // No valid phone digits, return empty results
          return results;
        }
      }

      const clientPromise = clientQuery || Promise.resolve({ data: [], error: null });

      // Start both client and pet searches in parallel (if not phone/email)
      const [clientsResult, petsSearchResult] = await Promise.all([
        clientPromise,
        // Only search pets if not phone/email search
        !isPhone && !isEmail && canViewClients
          ? this.supabaseService
              .getClient()
              .from('pets')
              .select('id, name, species, breed, client_id')
              .eq('tenant_id', user.clinic_id)
              .ilike('name', searchTerm)
              .limit(10)
          : Promise.resolve({ data: null, error: null } as { data: any[] | null; error: any }),
      ]);

        const { data: clientsData, error: clientsError } = clientsResult;
        let cachedUsersData: any[] = [];

        if (!clientsError && clientsData && clientsData.length > 0) {
          // Explicitly type the clients data
          const typedClientsData = clientsData as Array<{ id: string; phone: string | null; user_id: string | null }>;
          const userIds = typedClientsData.map((c) => c.user_id).filter(Boolean);
          const clientIds = typedClientsData.map((c) => c.id).filter(Boolean);

        // Fetch users and pets in parallel
        const [usersResult, petsResult] = await Promise.all([
          userIds.length > 0
            ? this.supabaseService
                .getClient()
                .from('users')
                .select('id, full_name, email')
                .in('id', userIds)
            : Promise.resolve({ data: [], error: null }),
          clientIds.length > 0
            ? this.supabaseService
                .getClient()
                .from('pets')
                .select('id, name, client_id, species, breed')
                .in('client_id', clientIds)
                .eq('tenant_id', user.clinic_id)
                .limit(50)
            : Promise.resolve({ data: [], error: null }),
        ]);

        const { data: usersData } = usersResult;
        const { data: petsData } = petsResult;

        // Store usersData for potential reuse in pet search
        cachedUsersData = usersData || [];

        // Build maps
        const petsMap = new Map<string, any[]>();
        if (petsData) {
          petsData.forEach((pet: any) => {
            if (!petsMap.has(pet.client_id)) {
              petsMap.set(pet.client_id, []);
            }
            petsMap.get(pet.client_id)!.push(pet);
          });
        }

        const usersMap = new Map();
        if (usersData) {
          usersData.forEach((u) => usersMap.set(u.id, u));
        }

        // Process each client
        typedClientsData.forEach((client) => {
          const userData = usersMap.get(client.user_id);
          if (!userData) return;

          const clientName =
            userData.full_name || userData.email?.split('@')[0] || 'Unknown';
          const pets = petsMap.get(client.id) || [];
          const petsList = pets
            .slice(0, 3)
            .map((p: any) => p.name)
            .join(', ');

          let score = 0;
          if (isPhone) {
            score = 0.9;
          } else if (isEmail) {
            const emailMatch = userData.email
              ?.toLowerCase()
              .includes(searchQuery.toLowerCase());
            score = emailMatch ? 0.9 : 0;
          } else {
            const searchText = `${clientName} ${userData.email || ''} ${client.phone || ''}`.toLowerCase();
            score = this.calculateMatchScore(searchQuery, searchText);
          }

          // Filter by search term if not phone/email
          if (!isPhone && !isEmail) {
            const matches =
              clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
              userData.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              client.phone?.includes(searchQuery);
            if (!matches) return;
          }

          if (score > 0) {
            results.push({
              id: client.id,
              type: 'client',
              primaryLabel: clientName,
              secondaryLabel:
                pets.length > 0
                  ? `Pets: ${petsList}${pets.length > 3 ? ` +${pets.length - 3}` : ''}`
                  : 'No pets',
              meta: client.phone || userData.email || '',
              canView: true,
              associatedRecords: pets.slice(0, 5).map((p: any) => ({
                type: 'patient' as const,
                id: p.id,
                label: p.name,
              })),
              matchScore: score,
              timestamp: Date.now(),
            });
          }
        });
      }

      // Process pet search results if we have them
      if (petsSearchResult.data && !isPhone && !isEmail) {
        const petsData = petsSearchResult.data as any[];
        if (petsData.length > 0) {
          const clientIds = petsData.map((p: any) => p.client_id).filter(Boolean);

          // Fetch client info
          const clientsResult =
            clientIds.length > 0
              ? await this.supabaseService
                  .getClient()
                  .from('clients')
                  .select('id, user_id')
                  .in('id', clientIds)
              : { data: [] as any[] };
          const clientsData = clientsResult.data || [];

          const existingUsersMap = new Map();
          if (cachedUsersData) {
            cachedUsersData.forEach((u) => existingUsersMap.set(u.id, u));
          }

          // Get any missing user IDs
          const missingUserIds =
            clientsData
              ?.map((c) => c.user_id)
              .filter((id) => id && !existingUsersMap.has(id)) || [];

          let additionalUsers: any[] = [];
          if (missingUserIds.length > 0) {
            const { data: additionalUsersData } = await this.supabaseService
              .getClient()
              .from('users')
              .select('id, full_name, email')
              .in('id', missingUserIds);
            additionalUsers = additionalUsersData || [];
          }

          // Merge user maps
          additionalUsers.forEach((u) => existingUsersMap.set(u.id, u));

          const clientsMap = new Map<string, any>();
          if (clientsData) {
            clientsData.forEach((c: any) => clientsMap.set(c.id, c));
          }

          petsData.forEach((pet: any) => {
            const client = clientsMap.get(pet.client_id);
            const userData = client
              ? existingUsersMap.get(client.user_id)
              : null;
            const clientName =
              userData?.full_name ||
              userData?.email?.split('@')[0] ||
              'Unknown';

            const searchText = `${pet.name} ${pet.species || ''} ${pet.breed || ''} ${clientName}`.toLowerCase();
            const score = this.calculateMatchScore(searchQuery, searchText);

            if (score > 0) {
              results.push({
                id: pet.id,
                type: 'patient',
                primaryLabel: pet.name,
                secondaryLabel: `Client: ${clientName}`,
                meta: `${pet.species || 'Unknown'} • ${pet.breed || 'Unknown breed'}`,
                canView: true,
                associatedRecords: client
                  ? [
                      {
                        type: 'client' as const,
                        id: client.id,
                        label: clientName,
                      },
                    ]
                  : undefined,
                matchScore: score,
                timestamp: Date.now(),
              });
            }
          });
        }
      }
    } catch (error) {
      console.error('Error performing search:', error);
      throw new BadRequestException(
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Sort by match score and limit to 20 results (matches original frontend behavior)
    return results
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, 20);
  }

  /**
   * Normalize search query
   * Matches original frontend logic from myvetly-dev
   */
  private normalizeQuery(query: string): string {
    return query
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');
  }

  /**
   * Check if query matches phone number pattern
   * Matches original frontend logic from myvetly-dev
   */
  private isPhoneQuery(query: string): boolean {
    const digits = query.replace(/\D/g, '');
    return digits.length >= 7;
  }

  /**
   * Check if query is an email
   */
  private isEmailQuery(query: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(query);
  }

  /**
   * Calculate match score for search results
   * Matches original frontend logic from myvetly-dev
   */
  private calculateMatchScore(query: string, text: string): number {
    const normalizedQuery = this.normalizeQuery(query);
    const normalizedText = this.normalizeQuery(text);
    
    // Exact match gets highest score
    if (normalizedText === normalizedQuery) return 1.0;
    
    // Starts with query gets high score
    if (normalizedText.startsWith(normalizedQuery)) return 0.9;
    
    // Contains query gets medium score
    if (normalizedText.includes(normalizedQuery)) return 0.7;
    
    // Word boundary match gets medium-high score
    const words = normalizedText.split(' ');
    const queryWords = normalizedQuery.split(' ');
    let wordMatches = 0;
    
    for (const queryWord of queryWords) {
      for (const word of words) {
        if (word.startsWith(queryWord)) {
          wordMatches++;
          break;
        }
      }
    }
    
    if (wordMatches > 0) {
      return 0.5 + (wordMatches / queryWords.length) * 0.3;
    }
    
    // Fuzzy match gets low score
    if (normalizedText.includes(normalizedQuery.substring(0, Math.max(2, normalizedQuery.length - 1)))) {
      return 0.3;
    }
    
    return 0;
  }
}

