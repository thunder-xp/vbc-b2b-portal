import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { analyzeExternalPriceSpreadsheet, ExternalPriceSpreadsheetError, extractDahuaModel, normalizeProductModel, parsePrice } from "../spreadsheet-parser";

const mapping={productCode:"B",productName:"C",description:"D",partnerPrice:"F",retailPrice:null};

describe("external price spreadsheet parser",()=>{
  it("parses every XLSX worksheet and retains price markers",()=>{
    const bytes=workbook([
      ["Камеры",[[1,"C","Модель"],[2,"C","DH-IPC-HFW1430DT-STW 4MP 2.8mm"],[2,"D","Dahua camera"],[2,"F","38,00*"]]],
      ["Регистраторы",[[1,"C","DHI-NVR4108HS-4KS3"],[1,"F","125.50"]]],
    ]);
    const result=analyzeExternalPriceSpreadsheet({bytes,format:"xlsx",mapping,priceSchema:"partner"});
    expect(result.sheetNames).toEqual(["Камеры","Регистраторы"]);
    expect(result.totalRows).toBe(3);
    expect(result.candidateRows).toBe(2);
    expect(result.ignoredRows).toBe(1);
    expect(result.markerRows).toBe(1);
    expect(result.rows[0]).toMatchObject({partnerPrice:38,marker:"*",normalizedModel:"DH-IPC-HFW1430DT-STW"});
  });

  it("parses bounded CSV and ignores non-Dahua products",()=>{
    const csv=new TextEncoder().encode("code;model;description;price\n1;DH-HAC-HFW1200T;Dahua;42,50*\n2;MikroTik hAP;router;30\n");
    const result=analyzeExternalPriceSpreadsheet({bytes:csv,format:"csv",mapping:{productCode:"A",productName:"B",description:"C",partnerPrice:"D",retailPrice:null},priceSchema:"partner"});
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].partnerPrice).toBe(42.5);
    expect(result.ignoredRows).toBe(2); // header and unrelated brand
  });

  it("supports partner, retail, and both price structures",()=>{
    const csv=new TextEncoder().encode("DH-IPC-HDW1230T;100;125\n");
    const base={bytes:csv,format:"csv" as const,mapping:{productName:"A",partnerPrice:"B",retailPrice:"C"}};
    expect(analyzeExternalPriceSpreadsheet({...base,priceSchema:"both"}).rows[0]).toMatchObject({partnerPrice:100,retailPrice:125});
    expect(analyzeExternalPriceSpreadsheet({...base,mapping:{productName:"A",partnerPrice:null,retailPrice:"C"},priceSchema:"retail"}).rows[0]).toMatchObject({partnerPrice:null,retailPrice:125});
  });

  it("normalizes models without removing identity suffixes",()=>{
    expect(extractDahuaModel("Dahua DH-IPC-HFW1430DT-STW 4MP")).toBe("DH-IPC-HFW1430DT-STW");
    expect(normalizeProductModel(" dh - ipc-hfw1430dt-stw (s2) ")).toBe("DH-IPC-HFW1430DT-STW(S2)");
    expect(parsePrice(" 38,00* ")).toEqual({amount:38,marker:"*"});
  });

  it("rejects malformed XLSX archives",()=>{
    expect(()=>analyzeExternalPriceSpreadsheet({bytes:new Uint8Array([0x50,0x4b,0x03,0x04]),format:"xlsx",mapping,priceSchema:"partner"})).toThrow(ExternalPriceSpreadsheetError);
  });
});

function workbook(sheets:Array<[string,Array<[number,string,string]>]>):Uint8Array{
  const shared:string[]=[]; const sharedIndex=(value:string)=>{let index=shared.indexOf(value);if(index<0){shared.push(value);index=shared.length-1;}return index;};
  const files:Record<string,Uint8Array>={};
  files["[Content_Types].xml"]=strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>');
  files["xl/workbook.xml"]=strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([name],i)=>`<sheet name="${name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`);
  files["xl/_rels/workbook.xml.rels"]=strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}</Relationships>`);
  sheets.forEach(([,cells],index)=>{const byRow=new Map<number,Array<[string,string]>>();for(const[row,col,val]of cells)byRow.set(row,[...(byRow.get(row)??[]),[col,val]]);files[`xl/worksheets/sheet${index+1}.xml`]=strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${[...byRow].map(([row,values])=>`<row r="${row}">${values.map(([col,val])=>`<c r="${col}${row}" t="s"><v>${sharedIndex(val)}</v></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`);});
  files["xl/sharedStrings.xml"]=strToU8(`<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map(value=>`<si><t>${value}</t></si>`).join("")}</sst>`);
  return zipSync(files);
}
