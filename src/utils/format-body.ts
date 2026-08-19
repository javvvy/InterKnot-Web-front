import MarkdownIt from 'markdown-it'
import DOMPurify from 'isomorphic-dompurify'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
})

// Force all links to open in new tab
const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, _env, self) {
  return self.renderToken(tokens, idx, options)
}
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noopener nofollow noreferrer')
  return defaultRender(tokens, idx, options, env, self)
}

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'del', 'ins', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'details', 'summary', 'ruby', 'rt', 'rp',
  'span', 'div', 'hr',
]

export function formatBodyText(text: string): string {
  const html = md.render(text)
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style'],
  })
}

export function sanitizeBodyHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style'],
  })
}
