// Timers accept strings as executable code. Permit inline functions and immutable
// lexical function bindings; do not require changing valid product callbacks.
export default {
  rules: {
    'function-callback': {
      meta: { type: 'problem', schema: [], messages: { unsafe: 'Timer callbacks must be functions, never dynamically supplied code.' } },
      create(context) {
        const isFunction = node => ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(node?.type);
        return {
          CallExpression(node) {
            const callee = node.callee;
            const name = callee.type === 'Identifier' ? callee.name :
              callee.type === 'MemberExpression' ? (callee.computed ? callee.property.value : callee.property.name) : undefined;
            if (!['setTimeout', 'setInterval'].includes(name)) return;
            const callback = node.arguments[0];
            if (isFunction(callback)) return;
            if (callback?.type === 'Identifier') {
              let scope = context.sourceCode.getScope(node), binding;
              while (scope && !binding) { binding = scope.set.get(callback.name); scope = scope.upper; }
              if (binding?.defs.length === 1 && !binding.references.some(reference => reference.isWrite() && !reference.init)) {
                const definition = binding.defs[0];
                if (definition.type === 'FunctionName' ||
                  (definition.type === 'Variable' && definition.parent.kind === 'const' && isFunction(definition.node.init))) return;
              }
            }
            context.report({ node, messageId: 'unsafe' });
          },
        };
      },
    },
  },
};
