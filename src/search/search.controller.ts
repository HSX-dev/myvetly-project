import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { UserContext } from '../auth/auth.guard';
import { GetUser } from '../utils/decorators/get-user.decorator';
import { SearchService } from './search.service';
import { SearchQueryDto, SearchResult } from './dto/search.dto';

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query('q') query: string,
    @GetUser() user: UserContext,
  ): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    return this.searchService.search(query, user);
  }
}

