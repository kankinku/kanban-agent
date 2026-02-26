/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config, type ConfigParameters, PolicyDecision, ToolConfirmationOutcome } from '@google/gemini-cli-core';
import { type MockShellCommand } from './MockShellExecutionService.js';
export interface AppRigOptions {
    fakeResponsesPath?: string;
    terminalWidth?: number;
    terminalHeight?: number;
    configOverrides?: Partial<ConfigParameters>;
}
export interface PendingConfirmation {
    toolName: string;
    toolDisplayName?: string;
    correlationId: string;
}
export declare class AppRig {
    private options;
    private renderResult;
    private config;
    private settings;
    private testDir;
    private sessionId;
    private pendingConfirmations;
    private breakpointTools;
    private lastAwaitedConfirmation;
    constructor(options?: AppRigOptions);
    initialize(): Promise<void>;
    private setupEnvironment;
    private createRigSettings;
    private stubRefreshAuth;
    private setupMessageBusListeners;
    render(): void;
    setMockCommands(commands: MockShellCommand[]): void;
    setToolPolicy(toolName: string | undefined, decision: PolicyDecision, priority?: number): void;
    setBreakpoint(toolName: string | string[] | undefined): void;
    removeToolPolicy(toolName?: string, source?: string): void;
    getTestDir(): string;
    getPendingConfirmations(): PendingConfirmation[];
    private waitUntil;
    waitForPendingConfirmation(toolNameOrDisplayName?: string | RegExp, timeout?: number): Promise<PendingConfirmation>;
    resolveTool(toolNameOrDisplayName: string | RegExp | PendingConfirmation, outcome?: ToolConfirmationOutcome): Promise<void>;
    resolveAwaitedTool(outcome?: ToolConfirmationOutcome): Promise<void>;
    addUserHint(_hint: string): Promise<void>;
    getConfig(): Config;
    type(text: string): Promise<void>;
    pressEnter(): Promise<void>;
    pressKey(key: string): Promise<void>;
    get lastFrame(): string;
    getStaticOutput(): string;
    waitForOutput(pattern: string | RegExp, timeout?: number): Promise<void>;
    waitForIdle(timeout?: number): Promise<void>;
    sendMessage(text: string): Promise<void>;
    unmount(): Promise<void>;
}
