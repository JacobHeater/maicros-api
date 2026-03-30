// tools/tools.module.ts
import { Module } from '@nestjs/common';
import { ToolRegistry } from './tool-registry.service';
import { NutritionModule } from '@/services/nutrition/nutrition.module';
import { FoodLookupTool } from './nutrition/food/food-lookup.tool';

@Module({
  imports: [NutritionModule],
  providers: [ToolRegistry, FoodLookupTool],
  exports: [ToolRegistry],
})
export class ToolsModule {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly foodLookup: FoodLookupTool
  ) {
    this.registry.register(this.foodLookup);
  }
}
