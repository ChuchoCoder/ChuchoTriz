# QA del panel de Referencia C en Ratios

- Fecha y zona horaria: 25/11/2026, desde las 09:05, America/Buenos_Aires.
- Candidato verificado: ChuchoTriz Free 0.0.32, commit `5c6bb3ffcc014e1c8d9730aca1d1c6e3c3e23895`, árbol limpio.
- Entorno: Windows, Node 24.18.0 y Chrome 156, con datos sintéticos en loopback y el perfil compartido ChuchoTriz Free.
- ZIP: `chuchotriz-free-0.0.32.zip`, 25 archivos, SHA-256 `890505977a6be61af82b9f3932ac2011254d4e5aec292ad69bcb93ea9ae3ac28`.

| Caso | Entorno | Estado | Resultado |
| --- | --- | --- | --- |
| `npm run test:pr` | Local | PASS | Política, lint, 14 pruebas de seguridad, 587 Vitest, 97 Node, 2 de transporte, build, ZIP y auditoría con 0 vulnerabilidades. |
| Regresión general Playwright | Fixture | PASS | 70 casos de 20 suites, 0 fallos, ejecución completa. |
| Gráfico de Ratios | Fixture | PASS | 38 comprobaciones desde el widget, Monitor y Operaciones. Verifican el orden A, C y A/B, las escalas finales, los pares simples y la apertura en otra pestaña. |
| Futuros como Referencia C | Fixture | PASS | 8 comprobaciones de selección exacta, cotización, persistencia y panel propio del contrato C. |
| Inspección visual e histórico nativo | Cocos | BLOCKED | Matriz respondió HTTP 401 durante la carga del gráfico en el intento anterior. Repetir sobre el candidato con una sesión que pueda abrir el gráfico nativo. |

La revisión de estándares corrigió el diseño esperado en la guía de regresión.
La revisión funcional fijó la escala derecha de C después de mover el estudio
y agregó comprobaciones sobre la posición final de esa escala.

La regresión general quedó registrada en `test-results/qa-2026-11-25T12-05-16-914Z/report.json`.
Se cerraron las pestañas de prueba. No se instaló el candidato sobre el perfil,
no se guardaron diseños nativos y no se enviaron órdenes.
