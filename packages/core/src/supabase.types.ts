export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      card_photos: {
        Row: {
          card_id: string;
          created_at: string;
          id: string;
          slot: Database['public']['Enums']['photo_slot'];
          storage_path: string;
          touchpoint_id: string;
          touchpoint_type: Database['public']['Enums']['touchpoint_type'];
          user_id: string;
        };
        Insert: {
          card_id: string;
          created_at?: string;
          id?: string;
          slot: Database['public']['Enums']['photo_slot'];
          storage_path: string;
          touchpoint_id: string;
          touchpoint_type: Database['public']['Enums']['touchpoint_type'];
          user_id: string;
        };
        Update: {
          card_id?: string;
          created_at?: string;
          id?: string;
          slot?: Database['public']['Enums']['photo_slot'];
          storage_path?: string;
          touchpoint_id?: string;
          touchpoint_type?: Database['public']['Enums']['touchpoint_type'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'card_photos_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'card_photos_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      cards: {
        Row: {
          closed_at: string | null;
          contractor_tag: Database['public']['Enums']['contractor_tag'] | null;
          cost_estimate_diy: Json | null;
          cost_estimate_hire: Json | null;
          created_at: string;
          diagnosis: string | null;
          fix_steps_diy: Json | null;
          fix_steps_hire: Json | null;
          id: string;
          initial_description: string | null;
          monitoring_cadence_days: number | null;
          next_check_at: string | null;
          room_tag: string | null;
          severity: Database['public']['Enums']['severity'] | null;
          state: Database['public']['Enums']['card_state'];
          system_tag: Database['public']['Enums']['system_tag'] | null;
          title: string | null;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          closed_at?: string | null;
          contractor_tag?: Database['public']['Enums']['contractor_tag'] | null;
          cost_estimate_diy?: Json | null;
          cost_estimate_hire?: Json | null;
          created_at?: string;
          diagnosis?: string | null;
          fix_steps_diy?: Json | null;
          fix_steps_hire?: Json | null;
          id?: string;
          initial_description?: string | null;
          monitoring_cadence_days?: number | null;
          next_check_at?: string | null;
          room_tag?: string | null;
          severity?: Database['public']['Enums']['severity'] | null;
          state?: Database['public']['Enums']['card_state'];
          system_tag?: Database['public']['Enums']['system_tag'] | null;
          title?: string | null;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          closed_at?: string | null;
          contractor_tag?: Database['public']['Enums']['contractor_tag'] | null;
          cost_estimate_diy?: Json | null;
          cost_estimate_hire?: Json | null;
          created_at?: string;
          diagnosis?: string | null;
          fix_steps_diy?: Json | null;
          fix_steps_hire?: Json | null;
          id?: string;
          initial_description?: string | null;
          monitoring_cadence_days?: number | null;
          next_check_at?: string | null;
          room_tag?: string | null;
          severity?: Database['public']['Enums']['severity'] | null;
          state?: Database['public']['Enums']['card_state'];
          system_tag?: Database['public']['Enums']['system_tag'] | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'cards_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      triage_conversations: {
        Row: {
          card_id: string;
          content: string;
          created_at: string;
          id: string;
          role: Database['public']['Enums']['triage_role'];
          round: number;
          user_id: string;
        };
        Insert: {
          card_id: string;
          content: string;
          created_at?: string;
          id?: string;
          role: Database['public']['Enums']['triage_role'];
          round: number;
          user_id: string;
        };
        Update: {
          card_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          role?: Database['public']['Enums']['triage_role'];
          round?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'triage_conversations_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: false;
            referencedRelation: 'cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'triage_conversations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      usage_counters: {
        Row: {
          card_count: number;
          triage_session_count: number;
          updated_at: string;
          user_id: string;
          week_start: string;
        };
        Insert: {
          card_count?: number;
          triage_session_count?: number;
          updated_at?: string;
          user_id: string;
          week_start?: string;
        };
        Update: {
          card_count?: number;
          triage_session_count?: number;
          updated_at?: string;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usage_counters_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          byok_used: boolean;
          created_at: string;
          id: string;
          location: string | null;
        };
        Insert: {
          byok_used?: boolean;
          created_at?: string;
          id: string;
          location?: string | null;
        };
        Update: {
          byok_used?: boolean;
          created_at?: string;
          id?: string;
          location?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_card_slot: {
        Args: {
          p_description: string;
          p_room_tag: string;
          p_system_tag: Database['public']['Enums']['system_tag'];
          p_title: string;
          p_user: string;
        };
        Returns: {
          card_count_after: number;
          card_id: string;
        }[];
      };
    };
    Enums: {
      card_state:
        | 'capturing'
        | 'triaging'
        | 'diagnosed'
        | 'monitoring'
        | 'closed'
        | 'dismissed';
      contractor_tag:
        | 'diy'
        | 'handyman'
        | 'plumber'
        | 'electrician'
        | 'hvac_tech'
        | 'roofer'
        | 'general_contractor'
        | 'specialist';
      photo_slot: 'wide' | 'medium' | 'closeup';
      severity: 'cosmetic' | 'monitor' | 'soon' | 'urgent';
      system_tag:
        | 'plumbing'
        | 'electrical'
        | 'hvac'
        | 'roof'
        | 'exterior'
        | 'interior'
        | 'appliance'
        | 'safety'
        | 'other';
      touchpoint_type: 'primary' | 'context' | 'closeup';
      triage_role: 'system' | 'user' | 'assistant';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      card_state: [
        'capturing',
        'triaging',
        'diagnosed',
        'monitoring',
        'closed',
        'dismissed',
      ],
      contractor_tag: [
        'diy',
        'handyman',
        'plumber',
        'electrician',
        'hvac_tech',
        'roofer',
        'general_contractor',
        'specialist',
      ],
      photo_slot: ['wide', 'medium', 'closeup'],
      severity: ['cosmetic', 'monitor', 'soon', 'urgent'],
      system_tag: [
        'plumbing',
        'electrical',
        'hvac',
        'roof',
        'exterior',
        'interior',
        'appliance',
        'safety',
        'other',
      ],
      touchpoint_type: ['primary', 'context', 'closeup'],
      triage_role: ['system', 'user', 'assistant'],
    },
  },
} as const;
