import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsString()
  type?: 'client' | 'pet' | 'user' | 'all';
}

export interface SearchResult {
  id: string;
  type: 'patient' | 'client' | 'appointment' | 'invoice' | 'pet';
  primaryLabel: string;
  secondaryLabel: string;
  meta: string;
  associatedRecords?: {
    type: 'client' | 'patient';
    id: string;
    label: string;
  }[];
  canView: boolean;
  reason?: string;
  matchScore?: number;
  timestamp?: number;
}


