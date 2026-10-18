import { createContext } from 'react';

// Portal 모달도 자신을 연 작업 영역의 활성 상태를 따른다.
export const WorkspaceActivityContext = createContext(true);
