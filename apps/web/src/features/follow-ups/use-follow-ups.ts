import { useQuery } from '@tanstack/react-query';
import { fetchFollowUps } from './api';

export function useFollowUps() {
  return useQuery({ queryKey: ['follow-ups'], queryFn: fetchFollowUps });
}
