import { Button, EmptyState } from '@sirai/ui';
import { useNavigate } from 'react-router';

export function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="Esta sección no está disponible para tu rol"
      description="Si crees que deberías tener acceso, pide a la administración central que revise tus roles."
      action={
        <Button variant="secondary" onClick={() => navigate('/app')}>
          Volver al inicio
        </Button>
      }
    />
  );
}
