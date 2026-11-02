import { Module } from '@nestjs/common';
import { JobRuntime } from './job-runtime.js';

@Module({ providers: [JobRuntime] })
export class WorkerModule {}
