import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { EmptyState } from '../components/empty-state';
import { EstanciaStamp } from '../components/estancia-stamp';
import { Field } from '../components/field';
import { PageHeader } from '../components/page-header';
import { Select } from '../components/select';
import { Textarea } from '../components/textarea';
import { Table, Td, Th } from '../components/table';

describe('Button', () => {
  it('es type=button por defecto y anuncia carga desactivándose', () => {
    render(<Button loading>Guardar</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Un momento…');
  });

  it('aplica la clase de la variante', () => {
    render(<Button variant="danger">Borrar</Button>);
    expect(screen.getByRole('button').className).toContain('--color-danger');
  });
});

describe('Field', () => {
  it('asocia etiqueta, error y aria-invalid', () => {
    render(<Field label="Correo" error="Correo inválido" />);
    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Correo inválido');
    expect(input).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
  });

  it('muestra la ayuda cuando no hay error', () => {
    render(<Field label="Clave" hint="Mínimo 10 caracteres" />);
    expect(screen.getByText('Mínimo 10 caracteres')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('EmptyState y PageHeader', () => {
  it('renderizan título, descripción y acción', () => {
    render(
      <>
        <PageHeader eyebrow="Estancia 01" title="Pase de lista" description="Hoy" actions={<Button>Abrir</Button>} />
        <EmptyState title="Sin jornada" description="Abre la jornada para empezar." action={<Button>Abrir jornada</Button>} />
      </>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Pase de lista' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Sin jornada' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});

describe('EstanciaStamp, Badge y Table', () => {
  it('muestra clave y nombre de la estancia', () => {
    render(<EstanciaStamp code="EBDI-TEST-01" name="Estancia de prueba 01" size="lg" />);
    expect(screen.getByText('EBDI-TEST-01')).toBeInTheDocument();
    expect(screen.getByText('Estancia de prueba 01')).toBeInTheDocument();
  });

  it('tabla con cabeceras de columna accesibles', () => {
    render(
      <Table>
        <thead>
          <tr>
            <Th>Nombre</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>
              <Badge tone="success">Activo</Badge>
            </Td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });
});

describe('Select', () => {
  it('asocia etiqueta, opciones y error', () => {
    render(
      <Select label="Sala" error="Elige una sala">
        <option value="">Selecciona</option>
        <option value="1">Lactantes</option>
      </Select>,
    );
    const select = screen.getByLabelText('Sala');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Elige una sala');
    expect(screen.getByRole('option', { name: 'Lactantes' })).toBeInTheDocument();
  });
});

describe('Textarea', () => {
  it('asocia etiqueta, ayuda y error', () => {
    render(<Textarea label="Notas" hint="Se guardan cifradas" error="Escribe algo" />);
    const area = screen.getByLabelText('Notas');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe algo');
  });

  it('muestra la ayuda cuando no hay error y la enlaza con aria-describedby', () => {
    render(<Textarea label="Notas" hint="Se guardan cifradas" />);
    const area = screen.getByLabelText('Notas');
    expect(area).not.toHaveAttribute('aria-invalid');
    expect(area.getAttribute('aria-describedby')).toBe(screen.getByText('Se guardan cifradas').id);
  });

  it('sin ayuda ni error no declara descripción', () => {
    render(<Textarea label="Notas" />);
    expect(screen.getByLabelText('Notas')).not.toHaveAttribute('aria-describedby');
  });
});
