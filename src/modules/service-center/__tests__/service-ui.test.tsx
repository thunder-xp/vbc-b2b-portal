import{render,screen}from"@testing-library/react";import{describe,expect,it,vi}from"vitest";
vi.mock("../actions",()=>({createServiceCaseAction:vi.fn(),addServiceMessageAction:vi.fn(),transitionServiceCaseAction:vi.fn()}));
import{ServiceCaseForm}from"../components";
describe("service creation UI",()=>{it("is mobile-safe and explains manual serial verification",()=>{render(<ServiceCaseForm selections={{orders:[],products:[]}}/>);expect(screen.getByRole("button",{name:"Создать заявку"})).toHaveClass("min-h-11");expect(screen.getByText(/ручном серийном номере/)).toBeInTheDocument();expect(screen.getByText(/только после диагностики/)).toBeInTheDocument()});});
