import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Box } from 'ink';
import { ToolConfirmationQueue } from './ToolConfirmationQueue.js';
import { StreamingState } from '../types.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
vi.mock('./StickyHeader.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        StickyHeader: vi.fn((props) => actual.StickyHeader(props)),
    };
});
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        validatePlanPath: vi.fn().mockResolvedValue(undefined),
        validatePlanContent: vi.fn().mockResolvedValue(undefined),
        processSingleFileContent: vi.fn().mockResolvedValue({
            llmContent: 'Plan content goes here',
            error: undefined,
        }),
    };
});
const { StickyHeader } = await import('./StickyHeader.js');
describe('ToolConfirmationQueue', () => {
    const mockConfig = {
        isTrustedFolder: () => true,
        getIdeMode: () => false,
        getModel: () => 'gemini-pro',
        getDebugMode: () => false,
        getTargetDir: () => '/mock/target/dir',
        getFileSystemService: () => ({
            readFile: vi.fn().mockResolvedValue('Plan content'),
        }),
        storage: {
            getProjectTempPlansDir: () => '/mock/temp/plans',
        },
    };
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it('renders the confirming tool with progress indicator', () => {
        const confirmingTool = {
            tool: {
                callId: 'call-1',
                name: 'ls',
                description: 'list files',
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: {
                    type: 'exec',
                    title: 'Confirm execution',
                    command: 'ls',
                    rootCommand: 'ls',
                    rootCommands: ['ls'],
                },
            },
            index: 1,
            total: 3,
        };
        const { lastFrame } = renderWithProviders(_jsx(ToolConfirmationQueue, { confirmingTool: confirmingTool }), {
            config: mockConfig,
            uiState: {
                terminalWidth: 80,
            },
        });
        const output = lastFrame();
        expect(output).toContain('Action Required');
        expect(output).toContain('1 of 3');
        expect(output).toContain('ls'); // Tool name
        expect(output).toContain('list files'); // Tool description
        expect(output).toContain("Allow execution of: 'ls'?");
        expect(output).toMatchSnapshot();
        const stickyHeaderProps = vi.mocked(StickyHeader).mock.calls[0][0];
        expect(stickyHeaderProps.borderColor).toBe(theme.status.warning);
    });
    it('returns null if tool has no confirmation details', () => {
        const confirmingTool = {
            tool: {
                callId: 'call-1',
                name: 'ls',
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: undefined,
            },
            index: 1,
            total: 1,
        };
        const { lastFrame } = renderWithProviders(_jsx(ToolConfirmationQueue, { confirmingTool: confirmingTool }), {
            config: mockConfig,
            uiState: {
                terminalWidth: 80,
            },
        });
        expect(lastFrame()).toBe('');
    });
    it('renders expansion hint when content is long and constrained', async () => {
        const longDiff = '@@ -1,1 +1,50 @@\n' + '+line\n'.repeat(50);
        const confirmingTool = {
            tool: {
                callId: 'call-1',
                name: 'replace',
                description: 'edit file',
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: {
                    type: 'edit',
                    title: 'Confirm edit',
                    fileName: 'test.ts',
                    filePath: '/test.ts',
                    fileDiff: longDiff,
                    originalContent: 'old',
                    newContent: 'new',
                },
            },
            index: 1,
            total: 1,
        };
        const { lastFrame } = renderWithProviders(_jsx(Box, { flexDirection: "column", height: 30, children: _jsx(ToolConfirmationQueue, { confirmingTool: confirmingTool }) }), {
            config: mockConfig,
            useAlternateBuffer: false,
            uiState: {
                terminalWidth: 80,
                terminalHeight: 20,
                constrainHeight: true,
                streamingState: StreamingState.WaitingForConfirmation,
            },
        });
        await waitFor(() => expect(lastFrame()).toContain('Press ctrl-o to show more lines'));
        expect(lastFrame()).toMatchSnapshot();
        expect(lastFrame()).toContain('Press ctrl-o to show more lines');
    });
    it('calculates availableContentHeight based on availableTerminalHeight from UI state', async () => {
        const longDiff = '@@ -1,1 +1,50 @@\n' + '+line\n'.repeat(50);
        const confirmingTool = {
            tool: {
                callId: 'call-1',
                name: 'replace',
                description: 'edit file',
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: {
                    type: 'edit',
                    title: 'Confirm edit',
                    fileName: 'test.ts',
                    filePath: '/test.ts',
                    fileDiff: longDiff,
                    originalContent: 'old',
                    newContent: 'new',
                },
            },
            index: 1,
            total: 1,
        };
        // Use a small availableTerminalHeight to force truncation
        const { lastFrame } = renderWithProviders(_jsx(ToolConfirmationQueue, { confirmingTool: confirmingTool }), {
            config: mockConfig,
            useAlternateBuffer: false,
            uiState: {
                terminalWidth: 80,
                terminalHeight: 40,
                availableTerminalHeight: 10,
                constrainHeight: true,
                streamingState: StreamingState.WaitingForConfirmation,
            },
        });
        // With availableTerminalHeight = 10:
        // maxHeight = Math.max(10 - 1, 4) = 9
        // availableContentHeight = Math.max(9 - 6, 4) = 4
        // MaxSizedBox in ToolConfirmationMessage will use 4
        // It should show truncation message
        await waitFor(() => expect(lastFrame()).toContain('first 49 lines hidden'));
        expect(lastFrame()).toMatchSnapshot();
    });
    it('does not render expansion hint when constrainHeight is false', () => {
        const longDiff = 'line\n'.repeat(50);
        const confirmingTool = {
            tool: {
                callId: 'call-1',
                name: 'replace',
                description: 'edit file',
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: {
                    type: 'edit',
                    title: 'Confirm edit',
                    fileName: 'test.ts',
                    filePath: '/test.ts',
                    fileDiff: longDiff,
                    originalContent: 'old',
                    newContent: 'new',
                },
            },
            index: 1,
            total: 1,
        };
        const { lastFrame } = renderWithProviders(_jsx(ToolConfirmationQueue, { confirmingTool: confirmingTool }), {
            config: mockConfig,
            uiState: {
                terminalWidth: 80,
                terminalHeight: 40,
                constrainHeight: false,
                streamingState: StreamingState.WaitingForConfirmation,
            },
        });
        const output = lastFrame();
        expect(output).not.toContain('Press ctrl-o to show more lines');
        expect(output).toMatchSnapshot();
    });
    it('renders AskUser tool confirmation with Success color', () => {
        const confirmingTool = {
            tool: {
                callId: 'call-1',
                name: 'ask_user',
                description: 'ask user',
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: {
                    type: 'ask_user',
                    questions: [],
                    onConfirm: vi.fn(),
                },
            },
            index: 1,
            total: 1,
        };
        const { lastFrame } = renderWithProviders(_jsx(ToolConfirmationQueue, { confirmingTool: confirmingTool }), {
            config: mockConfig,
            uiState: {
                terminalWidth: 80,
            },
        });
        const output = lastFrame();
        expect(output).toMatchSnapshot();
        const stickyHeaderProps = vi.mocked(StickyHeader).mock.calls[0][0];
        expect(stickyHeaderProps.borderColor).toBe(theme.status.success);
    });
    it('renders ExitPlanMode tool confirmation with Success color', async () => {
        const confirmingTool = {
            tool: {
                callId: 'call-1',
                name: 'exit_plan_mode',
                description: 'exit plan mode',
                status: CoreToolCallStatus.AwaitingApproval,
                confirmationDetails: {
                    type: 'exit_plan_mode',
                    planPath: '/path/to/plan',
                    onConfirm: vi.fn(),
                },
            },
            index: 1,
            total: 1,
        };
        const { lastFrame } = renderWithProviders(_jsx(ToolConfirmationQueue, { confirmingTool: confirmingTool }), {
            config: mockConfig,
            uiState: {
                terminalWidth: 80,
            },
        });
        await waitFor(() => {
            expect(lastFrame()).toContain('Plan content goes here');
        });
        const output = lastFrame();
        expect(output).toMatchSnapshot();
        const stickyHeaderProps = vi.mocked(StickyHeader).mock.calls[0][0];
        expect(stickyHeaderProps.borderColor).toBe(theme.status.success);
    });
});
//# sourceMappingURL=ToolConfirmationQueue.test.js.map