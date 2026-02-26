/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
import { type SerializableConfirmationDetails, type Config } from '@google/gemini-cli-core';
export interface ToolConfirmationMessageProps {
    callId: string;
    confirmationDetails: SerializableConfirmationDetails;
    config: Config;
    isFocused?: boolean;
    availableTerminalHeight?: number;
    terminalWidth: number;
}
export declare const ToolConfirmationMessage: React.FC<ToolConfirmationMessageProps>;
