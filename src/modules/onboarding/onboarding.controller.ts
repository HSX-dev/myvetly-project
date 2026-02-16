import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardClientDto } from './dto/onboard-client.dto';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) { }

  @Post('client')
  @HttpCode(HttpStatus.CREATED)
  onboardClient(@Body() onboardDto: OnboardClientDto) {
    return this.onboardingService.onboardClient(onboardDto);
  }
}

