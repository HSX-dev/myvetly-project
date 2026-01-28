import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for public routes
 * Routes marked with @Public() will skip authentication
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark routes as public (no authentication required)
 * 
 * @example
 * @Get('species')
 * @Public()
 * getSpecies() {
 *   return this.service.getSpecies();
 * }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);







