import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Spinner } from '@fluentui/react-components';
import { WrenchRegular } from '@fluentui/react-icons';
import type { WSAiConsoleMessage } from '@shared/types/WebSocketProtocol';
import './EventLine.css';

/** Shared styles for event line rendering (dark terminal theme) */
export const eventLineStyles = {
  eventLine: { marginBottom: '2px' },
  textEvent: { color: '#d4d4d4' },
  toolEvent: { color: '#569cd6' },
  initEvent: { color: '#858585', fontStyle: 'italic' as const },
  errorEvent: { color: '#f44747' },
  doneEvent: { color: '#6a9955', fontWeight: 'bold' as const },
};

interface EventLineProps {
  event: WSAiConsoleMessage;
}

export const EventLine: React.FC<EventLineProps> = ({ event }) => {
  const { eventType, content, toolName } = event.data;

  switch (eventType) {
    case 'init':
      return (
        <div style={{ ...eventLineStyles.eventLine, ...eventLineStyles.initEvent }}>
          {content}
        </div>
      );

    case 'text':
      return (
        <div className="eventline-markdown" style={{ ...eventLineStyles.eventLine, ...eventLineStyles.textEvent }}>
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </div>
      );

    case 'tool_use':
      return (
        <div style={{ ...eventLineStyles.eventLine, ...eventLineStyles.toolEvent }}>
          <WrenchRegular style={{ fontSize: '12px', marginRight: '4px' }} />
          [{toolName}] {content}
        </div>
      );

    case 'error':
      return (
        <div style={{ ...eventLineStyles.eventLine, ...eventLineStyles.errorEvent }}>
          {content}
        </div>
      );

    case 'done':
      return (
        <div style={{ ...eventLineStyles.eventLine, ...eventLineStyles.doneEvent }}>
          {content}
        </div>
      );

    case 'metrics':
      return null; // Rendered separately

    default:
      return (
        <div style={eventLineStyles.eventLine}>
          {content}
        </div>
      );
  }
};

interface ProcessingIndicatorProps {
  hasEvents: boolean;
  elapsed?: number;
  toolCount?: number;
}

const inlineSpinner = { display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' } as const;

export const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ hasEvents, elapsed, toolCount }) => {
  const time = elapsed != null ? ` (${elapsed}s)` : '';

  if (!hasEvents) {
    return (
      <span style={{ color: '#858585', display: 'inline-flex', alignItems: 'center' }}>
        <Spinner size="extra-tiny" style={inlineSpinner} />Waiting for Claude Code...{time}
      </span>
    );
  }
  if (toolCount && toolCount > 0) {
    return (
      <span style={{ color: '#858585', display: 'inline-flex', alignItems: 'center' }}>
        <Spinner size="extra-tiny" style={inlineSpinner} />Analyzing...{time.replace(')', `, ${toolCount} tool call${toolCount !== 1 ? 's' : ''})`)}
      </span>
    );
  }
  return (
    <span style={{ color: '#858585', display: 'inline-flex', alignItems: 'center' }}>
      <Spinner size="extra-tiny" style={inlineSpinner} />Claude is thinking...{time}
    </span>
  );
};
