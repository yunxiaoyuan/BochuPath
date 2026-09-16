import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('workspace modes and accessibility semantics', () => {
  it('renders a read-only workspace without write controls', async () => {
    render(<MemoryRouter initialEntries={['/diagrams/diagram_demo/view']}><App /></MemoryRouter>);
    expect(await screen.findByLabelText('通路图画布')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^查看$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('complementary', { name: '对象面板' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '属性面板' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^保存$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新增通路/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument();
    const fullscreen = screen.getByRole('button', { name: '画布全屏' });
    fireEvent.click(fullscreen);
    expect(fullscreen.closest('.workspace-shell')).toHaveClass('canvas-fullscreen-mode');
    expect(screen.getByRole('button', { name: '退出全屏' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(fullscreen.closest('.workspace-shell')).not.toHaveClass('canvas-fullscreen-mode');
  });
});
