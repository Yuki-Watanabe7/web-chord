import type { ReactNode } from 'react';
import styled from '@emotion/styled';
import { Link } from 'react-router-dom';

const LayoutContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const NavBar = styled.nav`
  background-color: #333;
  padding: 1rem;
  color: white;
`;

const NavContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Logo = styled(Link)`
  color: white;
  text-decoration: none;
  font-size: 1.5rem;
  font-weight: bold;
  
  &:hover {
    color: #ddd;
  }
`;

const MainContent = styled.main`
  flex: 1;
  padding: 20px;
`;

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  return (
    <LayoutContainer>
      <NavBar>
        <NavContent>
          <Logo to="/">コード進行エディタ</Logo>
        </NavContent>
      </NavBar>
      <MainContent>
        {children}
      </MainContent>
    </LayoutContainer>
  );
}

export default Layout; 