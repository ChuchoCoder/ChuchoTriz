const propertyName = node => node?.type === 'MemberExpression' ?
  (node.computed ? node.property.value : node.property.name) : undefined;

export default {
  rules: {
    'local-imports': {
      meta: { type: 'problem', schema: [], messages: { unsafe: 'Use a static bundled import path, never a remote URL or a dynamic code source.' } },
      create(context) {
        return {
          'ImportExpression, ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration'(node) {
            if (!node.source) return;
            const source = node.source.value;
            // URL parsers can discard C0 controls; reject them before checking schemes.
            if (typeof source !== 'string' || /[\u0000-\u001f\u007f]/.test(source) ||
              /^(?:[a-z][a-z\d+.-]*:|[\\/]{2})/i.test(source.trim())) {
              context.report({ node: node.source, messageId: 'unsafe' });
            }
          },
        };
      },
    },
    'document-html': {
      meta: { type: 'problem', schema: [], messages: { unsafe: 'Do not write executable HTML into the document.' } },
      create(context) {
        return {
          CallExpression(node) {
            if (!['write', 'writeln'].includes(propertyName(node.callee))) return;
            const target = node.callee.object;
            if ((target.type === 'Identifier' && target.name === 'document') ||
              (propertyName(target) === 'document' && target.object.type === 'Identifier' &&
                ['window', 'globalThis', 'self'].includes(target.object.name))) {
              context.report({ node, messageId: 'unsafe' });
            }
          },
        };
      },
    },
  },
};
