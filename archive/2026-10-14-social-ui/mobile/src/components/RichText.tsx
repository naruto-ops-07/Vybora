import { tokenizeText } from '@vybora/core';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Text, type TextStyle } from 'react-native';
import { useTheme } from '@/lib/theme';

/** Captions/comments rendered as plain text with tappable tags, mentions and links. */
export function RichText({
  text,
  style,
  numberOfLines,
}: {
  text: string;
  style?: TextStyle;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const link: TextStyle = { color: t.accent, fontWeight: '600' };
  return (
    <Text
      style={[{ color: t.text, fontSize: 14, lineHeight: 20 }, style]}
      numberOfLines={numberOfLines}
    >
      {tokenizeText(text).map((tok, i) => {
        switch (tok.type) {
          case 'hashtag':
            return (
              <Text
                key={i}
                style={link}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/tags/[tag]', params: { tag: tok.tag } })}
              >
                {tok.value}
              </Text>
            );
          case 'mention':
            return (
              <Text
                key={i}
                style={link}
                accessibilityRole="link"
                onPress={() =>
                  router.push({ pathname: '/u/[username]', params: { username: tok.username } })
                }
              >
                {tok.value}
              </Text>
            );
          case 'url':
            return (
              <Text
                key={i}
                style={link}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(tok.href)}
              >
                {tok.value.replace(/^https?:\/\//, '')}
              </Text>
            );
          default:
            return <Text key={i}>{tok.value}</Text>;
        }
      })}
    </Text>
  );
}
