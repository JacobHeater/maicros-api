import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import { AuthenticationDto } from './dto/authentication.dto';

@Controller('authentication')
export class AuthenticationController {
  constructor(private readonly authService: AuthenticationService) {}

  // POST /authentication/signin
  @Post('signin')
  async signIn(@Body() body: AuthenticationDto) {
    const { email } = body || {};
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }

    // Check if an OTP has been generated within the last 15 minutes.
    const hasRecent = await this.authService.hasRecentOtp(email, 15);

    if (hasRecent) {
      return { ok: true, message: 'OTP recently generated' };
    }

    // No recent OTP — request generation (stubbed in service).
    await this.authService.generateOtp(email);
    return { ok: true, message: 'OTP generated' };
  }

  // POST /authentication/signup
  @Post('signup')
  async signup(@Body() body: AuthenticationDto) {
    const { email } = body || {};
    if (!email) {
      throw new HttpException('Email is required', HttpStatus.BAD_REQUEST);
    }

    // Check if there's an existing user with this email
    const existing = await this.authService.findUserByEmail(email);
    if (existing) {
      throw new HttpException('User already exists', HttpStatus.CONFLICT);
    }

    // No existing user — create account. OTP validation/consumption occurs elsewhere.
    const user = await this.authService.createUser(email);
    return { ok: true, user };
  }
}
