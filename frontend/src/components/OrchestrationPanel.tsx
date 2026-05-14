import type { Pattern, SemanticEvent } from '../types';
import { ChatSupervisorDiagram } from './ChatSupervisorDiagram';
import { SequentialHandoffDiagram } from './SequentialHandoffDiagram';

interface Props {
  pattern: Pattern;
  events: SemanticEvent[];
  isActive: boolean;
}

export function OrchestrationPanel({ pattern, events, isActive }: Props) {
  return (
    <div className="orchestration-panel">
      {pattern === 'chat-supervisor' ? (
        <ChatSupervisorDiagram events={events} isActive={isActive} />
      ) : (
        <SequentialHandoffDiagram events={events} isActive={isActive} />
      )}
    </div>
  );
}
