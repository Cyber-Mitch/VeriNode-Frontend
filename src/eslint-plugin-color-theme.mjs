const plugin = {
  meta: {
    name: 'eslint-plugin-color-theme',
    version: '1.0.0',
  },
  rules: {
    'no-hardcoded-colors': {
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value !== 'string') return

            const text = context.getSourceCode().text.slice(node.range[0], node.range[1])
            if (!/(color|background):/i.test(text)) return

            const value = node.value.trim()
            if (/^(#(?:[0-9a-f]{3,8})|rgb[a]?\(|hsl[a]?\(|transparent|currentColor|inherit|initial|unset|revert|var\(--)/i.test(value)) {
              return
            }

            context.report({
              node,
              message: 'Use theme tokens instead of hard-coded color values.',
            })
          },
        }
      },
    },
  },
}

export default plugin
