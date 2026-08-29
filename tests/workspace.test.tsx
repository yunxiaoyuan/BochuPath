import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('workspace modes and accessibility semantics', () => {
  it('renders a read-only workspace without write controls', async () => {
    render(<MemoryRouter initialEntries={['/diagrams/diagram_demo/view']}><App /></MemoryRouter>);
    expect(await screen.findByLabelText('通路图画布')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^查看$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: '结构' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: /^保存$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新增通路/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('tree', { name: '层级和节点结构' })).toBeInTheDocument());
  });
});
