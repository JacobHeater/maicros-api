import { Module } from '@nestjs/common';
import { FoodService } from './food/food.service';
import { EmbeddingService } from './embedding/embedding.service';

@Module({
  providers: [FoodService, EmbeddingService],
  exports: [FoodService, EmbeddingService],
})
export class NutritionModule {}
